import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGetAll, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 120;

const PRES_STATUS = 'bouquetReceived';
const FULL_STATUS = 'readyToPackage';

// Design: scan PF API directly for these statuses so we catch same-day transitions.
// frameCompleted = designer sent frame to client (still awaiting response)
// approved / disapproved = client responded (designer already did their work)
const DESIGN_PF_STATUSES = new Set(['frameCompleted', 'approved', 'disapproved']);

const DESIGN_STATUSES = new Set([
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved',
]);

interface WeeklyReportItem {
  orderNumber?: string | number;
  shopifyOrderNumber?: string | number;
  variantTitle?: string;
  status?: string;
  location?: string;
  orderDateUpdated?: string | null;
}

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

function staffForStatus(item: SearchItem, isDesign: boolean, isPreservation: boolean): string {
  let fn = '', ln = '';
  if (isPreservation) {
    fn = item.preservationUserFirstName ?? '';
    ln = item.preservationUserLastName  ?? '';
  } else if (isDesign) {
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
  const today    = new Date();

  try {
    if (req.nextUrl.searchParams.get('debug') === '1') {
      // Scan just this month and last month from PF API, show raw design results
      const debugPaths = [0, 1].map(m => {
        const y = today.getFullYear();
        const mo = today.getMonth() - m;
        const first = new Date(y, mo, 1);
        const last  = m === 0 ? today : new Date(y, mo + 1, 0);
        return `/OrderProducts/WeeklyReport?startDate=${fmtDate(first)}&endDate=${fmtDate(last)}`;
      });
      const debugResults = await pfGetAll<WeeklyReportItem[]>(debugPaths);
      const designHits: unknown[] = [];
      debugResults.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          if (!item.status || !DESIGN_PF_STATUSES.has(item.status)) return;
          designHits.push({
            orderNumber: item.orderNumber,
            status: item.status,
            location: item.location,
            orderDateUpdated: item.orderDateUpdated,
            variantTitle: item.variantTitle,
          });
        });
      });
      return NextResponse.json({ start, end, location, designHitsCount: designHits.length, designHits: designHits.slice(0, 20) });
    }

    // ── Preservation + Fulfillment via Supabase ──────────────────────────────
    const pfQuery = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, status, first_seen_at')
      .in('status', [PRES_STATUS, FULL_STATUS])
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);

    if (location !== 'All') pfQuery.eq('location', location);
    const { data: pfRows, error: pfError } = await pfQuery;
    if (pfError) return NextResponse.json({ error: pfError.message }, { status: 500 });

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

    // ── Design via PF API directly ───────────────────────────────────────────
    // Scan 18 months of WeeklyReport, filter client-side by orderDateUpdated in range.
    // This catches orders that transitioned through frameCompleted so fast the daily
    // snapshot missed them (e.g., framed and approved the same day).
    const paths: string[] = [];
    for (let m = 0; m < 18; m++) {
      const y  = today.getFullYear();
      const mo = today.getMonth() - m;
      const firstOfMonth = new Date(y, mo, 1);
      const lastOfMonth  = m === 0 ? today : new Date(y, mo + 1, 0);
      paths.push(
        `/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`
      );
    }

    const designSeen = new Set<string>();
    const designRows: DeptRow[] = [];

    for (let i = 0; i < paths.length; i += 9) {
      const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 9));
      results.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          if (!item.status || !DESIGN_PF_STATUSES.has(item.status)) return;
          if (!item.orderDateUpdated) return;
          if (location !== 'All' && item.location !== location) return;

          // Filter by orderDateUpdated within the requested date range
          const updateDate = item.orderDateUpdated.split('T')[0];
          if (updateDate < start || updateDate > end) return;

          const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
          if (!num) return;
          const key = `${num}|${item.variantTitle ?? ''}`;
          if (designSeen.has(key)) return;
          designSeen.add(key);

          designRows.push({
            orderProductKey: key,
            orderNum:  num,
            variant:   item.variantTitle ?? '',
            enteredAt: updateDate,
          });
        });
      });
    }

    const empty = { Preservation: [], Design: [], Fulfillment: [] };
    if (!pfRows?.length && !designRows.length) return NextResponse.json(empty);

    // ── Look up staff + event date per dept via PF Search API ───────────────
    const DEPT_ROWS: Record<string, DeptRow[]> = {
      Preservation: byStatus[PRES_STATUS],
      Design:       designRows,
      Fulfillment:  byStatus[FULL_STATUS],
    };

    const result: Record<string, StaffRow[]> = {
      Preservation: [],
      Design:       [],
      Fulfillment:  [],
    };

    for (const [dept, deptRows] of Object.entries(DEPT_ROWS)) {
      if (!deptRows.length) continue;

      const isDesign       = dept === 'Design';
      const isPreservation = dept === 'Preservation';
      const statusKey      = dept === 'Preservation' ? PRES_STATUS : FULL_STATUS;

      const uniqueOrderNums = [...new Set(deptRows.map(r => r.orderNum))];
      const infoByOrderNum: Record<string, { staff: string; eventDate: string }> = {};
      const BATCH = 50;

      for (let i = 0; i < uniqueOrderNums.length; i += BATCH) {
        const batch = uniqueOrderNums.slice(i, i + BATCH);
        const searchResults = await Promise.all(
          batch.map(num =>
            pfPost<SearchResponse>('/OrderProducts/Search', {
              searchTerm: num,
              pageNumber: 1,
              pageSize: 10,
            }).catch(() => null)
          )
        );
        searchResults.forEach((data, j) => {
          const item = isDesign
            // For design: prefer any design-status item, fall back to first
            ? (data?.items?.find(i => DESIGN_STATUSES.has(i.status ?? '')) ?? data?.items?.[0])
            : (data?.items?.find(i => i.status === statusKey) ?? data?.items?.[0]);
          infoByOrderNum[batch[j]] = {
            staff:     item ? staffForStatus(item, isDesign, isPreservation) : '',
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
