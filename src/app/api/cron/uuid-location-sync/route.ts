import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGetAll, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

// ─── Pipeline statuses we care about ────────────────────────────────────────
const PIPELINE_STATUSES = new Set([
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved', 'noResponse',
  'readyToSeal', 'glued', 'readyToPackage', 'readyToFulfill', 'preparingToBeShipped',
]);

interface SearchItem {
  uuid:                      string;
  shopifyOrderNumber:        string;
  status:                    string;
  orderDate?:                string;
  assignedToUserFirstName?:  string | null;
  assignedToUserLastName?:   string | null;
  preservationUserFirstName?: string | null;
  preservationUserLastName?:  string | null;
  fulfillmentUserFirstName?:  string | null;
  fulfillmentUserLastName?:   string | null;
}

interface SearchResponse {
  totalItems:   number;
  totalPages:   number;
  items:        SearchItem[];
}

interface WeeklyReportItem {
  orderNumber?:        string | number;
  shopifyOrderNumber?: string | number;
  location?:           string | null;
}

export async function GET(req: NextRequest) {
  // Allow cron secret OR authenticated dashboard call
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return runSync();
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return runSync();
}

async function runSync() {
  try {
    // ── Step 1: Load staff → location map from Supabase ──────────────────────
    const { data: staffRows } = await supabase
      .from('staff_locations')
      .select('name, location');

    const staffLocationMap: Record<string, string> = {};
    staffRows?.forEach(r => { staffLocationMap[r.name.trim()] = r.location; });

    // ── Step 2: Page through Search to collect all pipeline UUIDs ────────────
    // searchTerm: ' ' (single space) returns all items, pageSize max is 50
    const PAGE_SIZE = 50;
    let pageNumber = 1;
    let totalPages = 1;

    // uuid → item data
    const pipelineItems = new Map<string, SearchItem>();
    // orderNum → Set of UUIDs (to know which orders have pipeline items)
    const orderNumToUuids = new Map<string, Set<string>>();

    console.log('Starting Search scan...');

    while (pageNumber <= totalPages) {
      const res = await pfPost<SearchResponse>('/OrderProducts/Search', {
        searchTerm: ' ',
        pageSize:   PAGE_SIZE,
        pageNumber,
      });

      if (!res.items || res.items.length === 0) break;
      totalPages = res.totalPages;

      res.items.forEach(item => {
        if (!PIPELINE_STATUSES.has(item.status)) return;
        if (!item.uuid || !item.shopifyOrderNumber) return;

        pipelineItems.set(item.uuid, item);

        const orderNum = String(item.shopifyOrderNumber);
        if (!orderNumToUuids.has(orderNum)) {
          orderNumToUuids.set(orderNum, new Set());
        }
        orderNumToUuids.get(orderNum)!.add(item.uuid);
      });

      pageNumber++;
    }

    console.log(`Search scan complete. Pipeline UUIDs: ${pipelineItems.size}, unique orders: ${orderNumToUuids.size}`);

    if (pipelineItems.size === 0) {
      return NextResponse.json({ synced: 0, message: 'No pipeline items found' });
    }

    // ── Step 3: Build orderNum → location map from WeeklyReport ─────────────
    // Scan 12 months — covers all active orders
    const today = new Date();
    const weeklyPaths: string[] = [];
    for (let m = 0; m < 12; m++) {
      const first = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const last  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
      weeklyPaths.push(
        `/OrderProducts/WeeklyReport?startDate=${fmtDate(first)}&endDate=${fmtDate(last)}&pageSize=1000`
      );
    }

    const orderNumToLocation = new Map<string, string>();

    for (let i = 0; i < weeklyPaths.length; i += 6) {
      const results = await pfGetAll<WeeklyReportItem[]>(weeklyPaths.slice(i, i + 6));
      results.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
          if (!num || !item.location) return;
          // Only set if we have a pipeline order with this number and no location yet
          if (orderNumToUuids.has(num) && !orderNumToLocation.has(num)) {
            orderNumToLocation.set(num, item.location);
          }
        });
      });
    }

    console.log(`WeeklyReport scan complete. Orders with explicit location: ${orderNumToLocation.size}`);

    // ── Step 4: Resolve location for each UUID ───────────────────────────────
    const rows: {
      uuid:       string;
      order_num:  string;
      status:     string;
      location:   string | null;
      staff_name: string | null;
      order_date: string | null;
      synced_at:  string;
    }[] = [];

    const now = new Date().toISOString();

    for (const [uuid, item] of pipelineItems) {
      const orderNum = String(item.shopifyOrderNumber);
      let location: string | null = null;
      let staffName: string | null = null;

      // Try explicit location from WeeklyReport first
      const wrLocation = orderNumToLocation.get(orderNum);
      if (wrLocation) {
        location = wrLocation;
      } else {
        // Fall back to staff lookup
        // Check all three staff types in priority order
        const staffCandidates = [
          [item.preservationUserFirstName, item.preservationUserLastName],
          [item.assignedToUserFirstName, item.assignedToUserLastName],
          [item.fulfillmentUserFirstName, item.fulfillmentUserLastName],
        ];

        for (const [first, last] of staffCandidates) {
          const name = [first, last].filter(Boolean).join(' ').trim();
          if (name && staffLocationMap[name]) {
            location = staffLocationMap[name];
            staffName = name;
            break;
          }
        }
      }

      rows.push({
        uuid,
        order_num:  orderNum,
        status:     item.status,
        location,
        staff_name: staffName,
        order_date: item.orderDate?.split('T')[0] ?? null,
        synced_at:  now,
      });
    }

    // ── Step 5: Upsert all rows to uuid_location_cache ───────────────────────
    // Delete rows no longer in pipeline (status changed/completed)
    const liveUuids = [...pipelineItems.keys()];

    // Delete in batches of 500
    const BATCH = 500;
    for (let i = 0; i < liveUuids.length; i += BATCH) {
      // We upsert rather than delete+insert to preserve any manual overrides
    }

    // Upsert all current pipeline UUIDs
    let upserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error } = await supabase
        .from('uuid_location_cache')
        .upsert(rows.slice(i, i + BATCH), { onConflict: 'uuid', ignoreDuplicates: false });
      if (error) {
        console.error('Upsert error:', error.message);
      } else {
        upserted += Math.min(BATCH, rows.length - i);
      }
    }

    // Delete UUIDs no longer in pipeline (status changed to shipped/complete etc)
    // Do this by deleting any uuid NOT in our current live set
    // We do this in batches to avoid query size limits
    const { data: existingRows } = await supabase
      .from('uuid_location_cache')
      .select('uuid');

    const existingUuids = new Set((existingRows ?? []).map(r => r.uuid));
    const liveSet = new Set(liveUuids);
    const toDelete = [...existingUuids].filter(u => !liveSet.has(u));

    if (toDelete.length > 0) {
      for (let i = 0; i < toDelete.length; i += BATCH) {
        await supabase
          .from('uuid_location_cache')
          .delete()
          .in('uuid', toDelete.slice(i, i + BATCH));
      }
      console.log(`Deleted ${toDelete.length} stale UUIDs`);
    }

    const resolved   = rows.filter(r => r.location !== null).length;
    const unresolved = rows.filter(r => r.location === null).length;

    return NextResponse.json({
      synced:      upserted,
      resolved,
      unresolved,
      deleted:     toDelete.length,
      totalScanned: pipelineItems.size,
      message:     `Synced ${upserted} UUIDs (${resolved} with location, ${unresolved} unresolved)`,
    });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
