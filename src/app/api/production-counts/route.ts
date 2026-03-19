import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 120;

// Preservation and Fulfillment: single tracked status, query by first_seen_at
const PRES_STATUS = 'bouquetReceived';
const FULL_STATUS = 'readyToPackage';

// Design: track all three statuses; entered_at is the actual PF API status-change date.
const DESIGN_TRACK = ['frameCompleted', 'approved', 'disapproved'] as const;

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
  orderNum:   string;
  variant:    string;
  enteredAt:  string;
  eventDate:  string;
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
    // Debug mode: show table stats to diagnose empty results
    if (req.nextUrl.searchParams.get('debug') === '1') {
      const { data: sample } = await supabase
        .from('order_status_history')
        .select('status, location, first_seen_at, entered_at')
        .in('status', [PRES_STATUS, FULL_STATUS, ...DESIGN_TRACK])
        .order('first_seen_at', { ascending: false })
        .limit(5);
      const { count } = await supabase
        .from('order_status_history')
        .select('*', { count: 'exact', head: true });
      return NextResponse.json({ debug: true, totalRows: count, startISO, endISO, recentSample: sample });
    }

    // ── Preservation + Fulfillment ──────────────────────────────────────────
    const pfQuery = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, status, first_seen_at')
      .in('status', [PRES_STATUS, FULL_STATUS])
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);

    if (location !== 'All') pfQuery.eq('location', location);

    const { data: pfRows, error: pfError } = await pfQuery;
    if (pfError) return NextResponse.json({ error: pfError.message }, { status: 500 });

    // ── Design ──────────────────────────────────────────────────────────────
    const dQuery = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, status, first_seen_at, entered_at')
      .in('status', [...DESIGN_TRACK])
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);

    if (location !== 'All') dQuery.eq('location', location);

    const { data: dRows, error: dError } = await dQuery;
    if (dError) return NextResponse.json({ error: dError.message }, { status: 500 });

    const empty = { Preservation: [], Design: [], Fulfillment: [] };
    if (!pfRows?.length && !dRows?.length) return NextResponse.json(empty);

    // ── Build byStatus ──────────────────────────────────────────────────────
    const byStatus: Record<string, DeptRow[]> = {
      [PRES_STATUS]: [],
      frameCompleted: [],
      [FULL_STATUS]:  [],
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

    // Dedupe design rows per order_product_key — prefer frameCompleted
    const designBest: Record<string, { order_product_key: string; order_num: string; status: string; entered_at: string | null; first_seen_at: string | null }> = {};
    dRows?.forEach(r => {
      const existing = designBest[r.order_product_key];
      if (!existing || r.status === 'frameCompleted') {
        designBest[r.order_product_key] = r;
      }
    });

    Object.values(designBest).forEach(r => {
      const variant = r.order_product_key.split('|').slice(1).join('|');
      byStatus['frameCompleted'].push({
        orderProductKey: r.order_product_key,
        orderNum:  r.order_num,
        variant,
        enteredAt: (r.entered_at ?? r.first_seen_at ?? '').split('T')[0],
      });
    });

    // ── Build results per dept ──────────────────────────────────────────────
    const DEPT_STATUS: Record<string, string> = {
      Preservation: PRES_STATUS,
      Design:       'frameCompleted',
      Fulfillment:  FULL_STATUS,
    };

    const result: Record<string, StaffRow[]> = {
      Preservation: [],
      Design:       [],
      Fulfillment:  [],
    };

    for (const [dept, status] of Object.entries(DEPT_STATUS)) {
      const deptRows = byStatus[status];
      if (!deptRows.length) continue;

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
          const item = DESIGN_STATUSES.has(status)
            ? (data?.items?.find(i => i.status === 'frameCompleted') ??
               data?.items?.find(i => i.status === 'approved' || i.status === 'disapproved') ??
               data?.items?.[0])
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
        staffMap[staff].push({
          orderNum,
          variant,
          enteredAt,
          eventDate: info?.eventDate ?? '',
        });
      });

      result[dept] = Object.entries(staffMap)
        .map(([staff, orders]) => ({
          staff,
          count:  orders.length,
          orders: orders.sort((a, b) => a.orderNum.localeCompare(b.orderNum, undefined, { numeric: true })),
        }))
        .sort((a, b) => b.count - a.count);
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
