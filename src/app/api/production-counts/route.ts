import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 120;

const PRES_STATUS = 'bouquetReceived';
const FULL_STATUS = 'readyToPackage';

// Design: track when designer completes work (moved out of readyToFrame)
// frameCompleted = designer sent frame to client
// approved / disapproved = client responded (designer work already done)
const DESIGN_STATUSES_DB = ['frameCompleted', 'approved', 'disapproved'];


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
    // preservationUserFirstName is always null in PF API — assigned staff is tracked via assignedToUser
    fn = item.assignedToUserFirstName ?? '';
    ln = item.assignedToUserLastName  ?? '';
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

  try {
    if (req.nextUrl.searchParams.get('debug') === '1') {
      // Show raw Supabase design rows for diagnosis
      const q = supabase
        .from('order_status_history')
        .select('order_product_key, order_num, status, location, first_seen_at')
        .in('status', DESIGN_STATUSES_DB)
        .gte('first_seen_at', startISO)
        .lte('first_seen_at', endISO)
        .order('first_seen_at', { ascending: false })
        .limit(50);
      if (location !== 'All') q.eq('location', location);
      const { data, error } = await q;
      return NextResponse.json({ start, end, location, count: data?.length ?? 0, rows: data, error });
    }

    // ── Preservation + Fulfillment via order_status_history ──────────────────
    const pfQ = supabase
      .from('order_status_history')
      .select('order_product_key, order_num, status, first_seen_at')
      .in('status', [PRES_STATUS, FULL_STATUS])
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);

    if (location !== 'All') pfQ.eq('location', location);
    const { data: pfRows, error: pfError } = await pfQ;
    if (pfError) return NextResponse.json({ error: pfError.message }, { status: 500 });

    const byStatus: Record<string, DeptRow[]> = {
      [PRES_STATUS]: [],
      [FULL_STATUS]: [],
    };

    pfRows?.forEach(r => {
      const variant   = r.order_product_key.split('|').slice(1).join('|');
      const enteredAt = (r.first_seen_at ?? '').split('T')[0];
      byStatus[r.status]?.push({
        orderProductKey: r.order_product_key,
        orderNum:  r.order_num,
        variant,
        enteredAt,
      });
    });

    // ── Design via design_completions (exact status-change timestamps) ────────
    const dcQ = supabase
      .from('design_completions')
      .select('order_num, order_product_key, variant_title, designer_name, changed_at')
      .gte('changed_at', startISO)
      .lte('changed_at', endISO);

    if (location !== 'All') dcQ.eq('location', location);
    const { data: dcRows, error: dcError } = await dcQ;
    if (dcError) return NextResponse.json({ error: dcError.message }, { status: 500 });

    // Deduplicate by order_product_key — keep earliest changed_at
    const designByKey: Record<string, DeptRow & { designerName?: string }> = {};
    dcRows?.forEach(r => {
      const key = r.order_product_key ?? r.order_num;
      const enteredAt = (r.changed_at ?? '').split('T')[0];
      const existing = designByKey[key];
      if (!existing || enteredAt < existing.enteredAt) {
        designByKey[key] = {
          orderProductKey: key,
          orderNum:    r.order_num,
          variant:     r.variant_title ?? '',
          enteredAt,
          designerName: r.designer_name ?? undefined,
        };
      }
    });

    const designRows = Object.values(designByKey);

    const DEPT_ROWS: Record<string, DeptRow[]> = {
      Preservation: byStatus[PRES_STATUS],
      Design:       designRows,
      Fulfillment:  byStatus[FULL_STATUS],
    };

    const empty = { Preservation: [], Design: [], Fulfillment: [] };
    if (!pfRows?.length && !dcRows?.length) return NextResponse.json(empty);

    // ── Look up staff + event date per dept via PF Search API ────────────────
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

      // Design: designer_name comes directly from design_completions — no Search API needed
      if (isDesign) {
        const staffMap: Record<string, OrderDetail[]> = {};
        (deptRows as (DeptRow & { designerName?: string })[]).forEach(({ orderNum, variant, enteredAt, designerName }) => {
          const staff = designerName || 'Unassigned';
          if (!staffMap[staff]) staffMap[staff] = [];
          staffMap[staff].push({ orderNum, variant, enteredAt, eventDate: '' });
        });
        result[dept] = Object.entries(staffMap)
          .map(([staff, orders]) => ({
            staff,
            count:  orders.length,
            orders: orders.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt)),
          }))
          .sort((a, b) => b.count - a.count);
        continue;
      }

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
          const item = data?.items?.find(i => i.status === statusKey) ?? data?.items?.[0];
          infoByOrderNum[batch[j]] = {
            staff:     item ? staffForStatus(item, false, isPreservation) : '',
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
