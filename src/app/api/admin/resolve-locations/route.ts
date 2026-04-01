import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, pfGet, pfPost, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

interface WeeklyReportItem {
  orderNumber?:        string | number;
  shopifyOrderNumber?: string | number;
  variantTitle?:       string;
  status?:             string;
  location?:           string;
  uuid?:               string;
}

interface SearchResponse {
  items?: { uuid?: string }[];
}

interface DetailsUpload {
  uploadType:               string;
  uploadedByUserFirstName?: string | null;
  uploadedByUserLastName?:  string | null;
}

interface Details {
  orderProductUploads?: DetailsUpload[];
  originalOrderDate?:   string | null;
  orderStatus?:         string | null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runResolve(true);
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return runResolve(false);
}

async function runResolve(previewOnly: boolean) {

  try {
    // ── Step 1: Load staff → location map ─────────────────────────────────────
    const { data: staffRows } = await supabase.from('staff_locations').select('name, location');
    const staffLocationMap: Record<string, string> = {};
    staffRows?.forEach(r => { staffLocationMap[r.name] = r.location; });

    // ── Step 2: Load already-resolved keys ───────────────────────────────────
    const { data: cached } = await supabase.from('order_location_cache').select('order_product_key');
    const alreadyResolved = new Set((cached ?? []).map(r => r.order_product_key));

    // ── Step 3: Scan WeeklyReport for unassigned orders ───────────────────────
    const today = new Date();
    const paths: string[] = [];
    for (let m = 0; m < 18; m++) {
      const first = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const last  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
      paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(first)}&endDate=${fmtDate(last)}`);
    }

    // key → { orderNum, variantTitle, uuid (may be null) }
    const toResolve = new Map<string, { orderNum: string; variantTitle: string; uuid: string | null }>();

    for (let i = 0; i < paths.length; i += 6) {
      const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 6));
      results.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          // Only unassigned orders (no location or location is blank)
          if (item.location) return;
          const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
          if (!num) return;
          const key = `${num}|${item.variantTitle ?? ''}`;
          if (alreadyResolved.has(key)) return;
          if (!toResolve.has(key)) {
            toResolve.set(key, {
              orderNum:     num,
              variantTitle: item.variantTitle ?? '',
              uuid:         item.uuid ?? null,
            });
          }
        });
      });
    }

    if (!toResolve.size) {
      return NextResponse.json({ resolved: 0, message: 'No new unassigned orders to resolve' });
    }

    // ── Step 4: Resolve missing UUIDs via Search ──────────────────────────────
    const needsSearch = [...toResolve.entries()].filter(([, v]) => !v.uuid);
    const SEARCH_BATCH = 20;

    for (let i = 0; i < needsSearch.length; i += SEARCH_BATCH) {
      const batch = needsSearch.slice(i, i + SEARCH_BATCH);
      const results = await Promise.all(
        batch.map(([, v]) =>
          pfPost<SearchResponse>('/OrderProducts/Search', {
            searchTerm: v.orderNum, pageNumber: 1, pageSize: 1,
          }).catch(() => null)
        )
      );
      results.forEach((res, j) => {
        const uuid = res?.items?.[0]?.uuid;
        if (uuid) {
          const [key, v] = batch[j];
          toResolve.set(key, { ...v, uuid });
        }
      });
    }

    // ── Step 5: Fetch Details for each order to get bouquet uploader ──────────
    const allEntries = [...toResolve.entries()].filter(([, v]) => !!v.uuid) as [string, { orderNum: string; variantTitle: string; uuid: string }][];
    const BATCH = 30;
    const rows: { order_product_key: string; order_num: string; location: string }[] = [];
    const unmatchedNames = new Map<string, number>(); // name → count of orders
    let noPhotoResolved = 0;
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);
    let oldOrderCount = 0;

    for (let i = 0; i < allEntries.length; i += BATCH) {
      const batch = allEntries.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(([, v]) =>
          pfGet<Details>(`/OrderProducts/Details/${v.uuid}`).catch(() => null)
        )
      );
      results.forEach((d, j) => {
        if (!d) return;
        const [key, { orderNum }] = batch[j];

        // Try bouquet uploader first, fall back to frame uploader
        const bouquetUpload = d.orderProductUploads?.find(u => u.uploadType === 'bouquet');
        const frameUpload   = d.orderProductUploads?.find(u => u.uploadType === 'frame');

        let uploaderName = '';
        let usedFallback = false;
        if (bouquetUpload) {
          uploaderName = [bouquetUpload.uploadedByUserFirstName, bouquetUpload.uploadedByUserLastName].filter(Boolean).join(' ').trim();
        } else if (frameUpload) {
          uploaderName = [frameUpload.uploadedByUserFirstName, frameUpload.uploadedByUserLastName].filter(Boolean).join(' ').trim();
          usedFallback = true;
        }

        const location = staffLocationMap[uploaderName] ?? '';
        if (!location) {
          // Track whether this is old (>12 months) for reporting
          const orderDate = d.originalOrderDate ? new Date(d.originalOrderDate) : null;
          const isOld = orderDate ? orderDate < twelveMonthsAgo : false;
          if (isOld) oldOrderCount++;

          const label = uploaderName
            ? (usedFallback ? `[frame] ${uploaderName}` : uploaderName)
            : '(no photo)';
          unmatchedNames.set(label, (unmatchedNames.get(label) ?? 0) + 1);
          return;
        }

        if (usedFallback) noPhotoResolved++;
        rows.push({ order_product_key: key, order_num: orderNum, location });
      });
    }

    // Build sorted unmatched list for preview/debugging
    const unmatched = [...unmatchedNames.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    if (previewOnly) {
      return NextResponse.json({
        previewOnly: true,
        wouldResolve: rows.length,
        noPhotoResolved,
        oldOrderCount,
        unmatched,
        total: toResolve.size,
      });
    }

    if (!rows.length) {
      return NextResponse.json({
        resolved: 0,
        total: toResolve.size,
        noPhotoResolved,
        oldOrderCount,
        unmatched,
        message: `Scanned ${toResolve.size} unassigned orders but none could be matched to a location`,
      });
    }

    // ── Step 6: Upsert to cache ───────────────────────────────────────────────
    const { error } = await supabase
      .from('order_location_cache')
      .upsert(rows, { onConflict: 'order_product_key', ignoreDuplicates: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ resolved: rows.length, noPhotoResolved, oldOrderCount, total: toResolve.size, unmatched });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
