import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 120;

const PRES_STATUS   = 'bouquetReceived';
const DESIGN_STATUS = 'frameCompleted'; // designer moves order OUT of readyToFrame
const FULL_STATUS   = 'readyToPackage';

const PRESERVATION_STATUSES = new Set([
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
]);
const DESIGN_STATUSES = new Set([
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved',
]);

interface SearchItem {
  assignedToUserFirstName?: string;
  assignedToUserLastName?: string;
  preservationUserFirstName?: string;
  preservationUserLastName?: string;
  fulfillmentUserFirstName?: string;
  fulfillmentUserLastName?: string;
  eventDate?: string;
  status?: string;
}

interface SearchResponse {
  items: SearchItem[];
}

function staffForStatus(item: SearchItem, status: string): string {
  let fn = '', ln = '';
  if (PRESERVATION_STATUSES.has(status)) {
    fn = item.preservationUserFirstName ?? '';
    ln = item.preservationUserLastName  ?? '';
  } else if (DESIGN_STATUSES.has(status)) {
    fn = item.assignedToUserFirstName ?? '';
    ln = item.assignedToUserLastName  ?? '';
  } else {
    fn = item.fulfillmentUserFirstName ?? '';
    ln = item.fulfillmentUserLastName  ?? '';
  }
  return `${fn} ${ln}`.trim();
}

export interface OrderDetail {
  orderNum:  string;
  variant:   string;
  enteredAt: string;
  eventDate: string;
}

export interface StaffRow {
  staff:  string;
  count:  number;
  orders: OrderDetail[];
}

type DeptRow = {
  orderProductKey: string;
  orderNum:        string;
  variant:         string;
  enteredAt:       string;
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start    = req.nextUrl.searchParams.get('start');
  const end      = req.nextUrl.searchParams.get('end');
  const location = req.nextUrl.searchParams.get('location') ?? 'Utah';
  if (!start || !end) {
    return NextResponse.json({ error: 'start and end required' }, { status: 400 });
  }

  const startISO = new Date(`${start}T00:00:00-06:00`).toISOString();
  const endISO   = new Date(`${end}T23:59:59-06:00`).toISOString();

  try {
    if (req.nextUrl.searchParams.get('debug') === '1') {
      const { data: sample } = await supabase
        .from('order_status_history')
        .select('status, location, first_seen_at, entered_at')
        .in('status', [PRES_STATUS, DESIGN_STATUS, FULL_STATUS])
        .order('first_seen_at', { ascending: false })
        .limit(10);
      const { count } = await supabase
        .from('order_status_history')
        .select('*', { count: 'exact', head: true });
      return NextResponse.json({ debug: true, totalRows: count, startISO, endISO, recentSample: sample });
    }

    // ── Preservation + Fulfillment (filter by first_seen_at) ────────────────
    const pfQuery = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, status, first_seen_at')
      .in('status', [PRES_STATUS, FULL_STATUS])
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);

    if (location !== 'All') pfQuery.eq('location', location);
    const { data: pfRows, error: pfError } = await pfQuery;
    if (pfError) return NextResponse.json({ error: pfError.message }, { status: 500 });

    // ── Design: frameCompleted filtered by entered_at (actual PF status date) ─
    // Primary: rows where entered_at is in range
    const dQuery1 = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, entered_at, first_seen_at')
      .eq('status', DESIGN_STATUS)
      .not('entered_at', 'is', null)
      .gte('entered_at', startISO)
      .lte('entered_at', endISO);

    if (location !== 'All') dQuery1.eq('location', location);

    // Fallback: rows where entered_at is null, use first_seen_at
    const dQuery2 = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, entered_at, first_seen_at')
      .eq('status', DESIGN_STATUS)
      .is('entered_at', null)
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);

    if (location !== 'All') dQuery2.eq('location', location);

    const [{ data: dRows1, error: dError1 }, { data: dRows2, error: dError2 }] = await Promise.all([dQuery1, dQuery2]);
    if (dError1) return NextResponse.json({ error: dError1.message }, { status: 500 });
    if (dError2) return NextResponse.json({ error: dError2.message }, { status: 500 });

    // Merge and dedupe by order_product_key (prefer rows with entered_at)
    const designSeen = new Set<string>();
    const designRows: DeptRow[] = [];
    for (const r of [...(dRows1 ?? []), ...(dRows2 ?? [])]) {
      if (designSeen.has(r.order_product_key)) continue;
      designSeen.add(r.order_product_key);
      const variant = r.order_product_key.split('|').slice(1).join('|');
      designRows.push({
        orderProductKey: r.order_product_key,
        orderNum:  r.order_num,
        variant,
        enteredAt: (r.entered_at ?? r.first_seen_at ?? '').split('T')[0],
      });
    }

    // ── Preservation + Fulfillment rows ────────────────────────────────────
    const byStatus: Record<string, DeptRow[]> = {
      [PRES_STATUS]: [],
      [FULL_STATUS]: [],
    };
    pfRows?.forEach(r => {
      if (!byStatus[r.status]) return;
      const variant = r.order_product_key.split('|').slice(1).join('|');
      byStatus[r.status].push({
        orderProductKey: r.order_product_key,
        orderNum:  r.order_num,
        variant,
        enteredAt: (r.first_seen_at ?? '').split('T')[0],
      });
    });

    const empty = { Preservation: [], Design: [], Fulfillment: [] };
    if (!pfRows?.length && !designRows.length) return NextResponse.json(empty);

    // ── Look up staff + event date per dept ─────────────────────────────────
    const DEPT_ROWS: Record<string, DeptRow[]> = {
      Preservation: byStatus[PRES_STATUS],
      Design:       designRows,
      Fulfillment:  byStatus[FULL_STATUS],
    };
    const DEPT_STATUS_KEY: Record<string, string> = {
      Preservation: PRES_STATUS,
      Design:       DESIGN_STATUS,
      Fulfillment:  FULL_STATUS,
    };

    const result: Record<string, StaffRow[]> = {
      Preservation: [],
      Design:       [],
      Fulfillment:  [],
    };

    for (const [dept, deptRows] of Object.entries(DEPT_ROWS)) {
      if (!deptRows.length) continue;
      const status = DEPT_STATUS_KEY[dept];

      const uniqueOrderNums = [...new Set(deptRows.map(r => r.orderNum))];
      const infoByOrderNum: Record<string, { staff: string; eventDate: string }> = {};
      const BATCH = 50;

      for (let i = 0; i < uniqueOrderNums.length; i += BATCH) {
        const batch = uniqueOrderNums.slice(i, i + BATCH);
        const results = await Promise.all(
          batch.map(num =>
            pfPost<SearchResponse>('/OrderProducts/Search', {
              searchTerm: num,
              pageNumber: 1,
              pageSize: 10,
            }).catch(() => null)
          )
        );
        results.forEach((data, j) => {
          // For Design: pick the item matching the target status, then fall back to first item
          const item = dept === 'Design'
            ? (data?.items?.find(i => i.status === DESIGN_STATUS) ?? data?.items?.[0])
            : (data?.items?.find(i => i.status === status) ?? data?.items?.[0]);
          infoByOrderNum[batch[j]] = {
            staff:     item ? staffForStatus(item, status) : '',
            eventDate: item?.eventDate?.split('T')[0] ?? '',
          };
        });
      }

      const staffMap: Record<string, OrderDetail[]> = {};
      deptRows.forEach(({ orderNum, variant, enteredAt }) => {
        const info  = infoByOrderNum[orderNum];
        const staff = info?.staff || 'Unassigned';
        if (!staffMap[staff]) staffMap[staff] = [];
        staffMap[staff].push({ orderNum, variant, enteredAt, eventDate: info?.eventDate ?? '' });
      });

      result[dept] = Object.entries(staffMap)
        .map(([staff, orders]) => ({
          staff,
          count:  orders.length,
          orders: orders.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt)),
        }))
        .sort((a, b) => b.count - a.count);
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
