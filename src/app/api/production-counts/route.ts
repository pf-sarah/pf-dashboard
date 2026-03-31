import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGet } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 120;

const PRES_STATUS = 'bouquetReceived';
const FULL_STATUS = 'readyToPackage';
const DESIGN_STATUSES_DB = ['frameCompleted', 'approved', 'disapproved'];

interface SearchItem {
  uuid?: string;
}

interface SearchResponse {
  items: SearchItem[];
}

interface DetailsUpload {
  uploadType: string;
  uploadedByUserFirstName?: string;
  uploadedByUserLastName?: string;
}

interface DetailsHistory {
  status: string;
  dateCreated: string;
  userFirstName?: string;
  userLastName?: string;
}

interface DetailsResponse {
  assignedToUserFirstName?: string;
  assignedToUserLastName?: string;
  fulfillmentUserFirstName?: string;
  fulfillmentUserLastName?: string;
  preservationUserFirstName?: string;
  preservationUserLastName?: string;
  eventDate?: string;
  orderProductUploads?: DetailsUpload[];
  history?: DetailsHistory[];
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

    // ── Design via design_completions (exact timestamps from webhook) ─────────
    const dcQ = supabase
      .from('design_completions')
      .select('order_num, order_product_key, variant_title, designer_name, changed_at')
      .gte('changed_at', startISO)
      .lte('changed_at', endISO);

    if (location !== 'All') dcQ.eq('location', location);
    const { data: dcRows, error: dcError } = await dcQ;
    if (dcError) return NextResponse.json({ error: dcError.message }, { status: 500 });

    // Deduplicate by order_product_key — keep earliest changed_at
    const designByKey: Record<string, DeptRow & { webhookDesigner?: string }> = {};
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
          webhookDesigner: r.designer_name ?? undefined,
        };
      }
    });

    // If no webhook data yet, fall back to Supabase snapshot for Design
    if (!dcRows?.length) {
      const dsQ = supabase
        .from('order_status_history')
        .select('order_product_key, order_num, status, first_seen_at')
        .in('status', DESIGN_STATUSES_DB)
        .gte('first_seen_at', startISO)
        .lte('first_seen_at', endISO);
      if (location !== 'All') dsQ.eq('location', location);
      const { data: dsRows } = await dsQ;
      dsRows?.forEach(r => {
        const key = r.order_product_key;
        const enteredAt = (r.first_seen_at ?? '').split('T')[0];
        const existing = designByKey[key];
        if (!existing || enteredAt < existing.enteredAt) {
          designByKey[key] = {
            orderProductKey: key,
            orderNum: r.order_num,
            variant: r.order_product_key.split('|').slice(1).join('|'),
            enteredAt,
          };
        }
      });
    }

    const designRows = Object.values(designByKey);

    const DEPT_ROWS: Record<string, (DeptRow & { webhookDesigner?: string })[]> = {
      Preservation: byStatus[PRES_STATUS],
      Design:       designRows,
      Fulfillment:  byStatus[FULL_STATUS],
    };

    if (!pfRows?.length && !designRows.length) {
      return NextResponse.json({ Preservation: [], Design: [], Fulfillment: [] });
    }

    // ── Look up staff via Search (UUID) + Details (upload staff) ─────────────
    const result: Record<string, StaffRow[]> = {
      Preservation: [],
      Design:       [],
      Fulfillment:  [],
    };

    for (const [dept, deptRows] of Object.entries(DEPT_ROWS)) {
      if (!deptRows.length) continue;

      const isDesign       = dept === 'Design';
      const isPreservation = dept === 'Preservation';

      const uniqueOrderNums = [...new Set(deptRows.map(r => r.orderNum))];
      const infoByOrderNum: Record<string, {
        staff: string;
        eventDate: string;
        enteredAtOverride?: string;
      }> = {};

      const BATCH = 30;

      for (let i = 0; i < uniqueOrderNums.length; i += BATCH) {
        const batch = uniqueOrderNums.slice(i, i + BATCH);

        // Step 1: Search to get UUIDs
        const searchResults = await Promise.all(
          batch.map(num =>
            pfPost<SearchResponse>('/OrderProducts/Search', {
              searchTerm: num,
              pageNumber: 1,
              pageSize: 10,
            }).catch(() => null)
          )
        );

        const uuids = searchResults.map(data => data?.items?.[0]?.uuid ?? null);

        // Step 2: Details for each UUID
        const detailsResults = await Promise.all(
          uuids.map(uuid =>
            uuid
              ? pfGet<DetailsResponse>(`/OrderProducts/Details/${uuid}`).catch(() => null)
              : null
          )
        );

        // Step 3: Extract staff from uploads + history
        detailsResults.forEach((details, j) => {
          const num     = batch[j];
          const uploads = details?.orderProductUploads ?? [];
          const history = details?.history ?? [];

          let staff = '';
          let enteredAtOverride: string | undefined;

          if (isPreservation) {
            // Primary: staff who uploaded bouquet photo
            const bouquet = uploads.find(u => u.uploadType === 'bouquet');
            if (bouquet) {
              staff = `${bouquet.uploadedByUserFirstName ?? ''} ${bouquet.uploadedByUserLastName ?? ''}`.trim();
            }
            // Fallback: preservationUser field, then assignedToUser
            if (!staff) staff = `${details?.preservationUserFirstName ?? ''} ${details?.preservationUserLastName ?? ''}`.trim();
            if (!staff) staff = `${details?.assignedToUserFirstName ?? ''} ${details?.assignedToUserLastName ?? ''}`.trim();

          } else if (isDesign) {
            // Primary: staff who uploaded frame photo
            const frame = uploads.find(u => u.uploadType === 'frame');
            if (frame) {
              staff = `${frame.uploadedByUserFirstName ?? ''} ${frame.uploadedByUserLastName ?? ''}`.trim();
            }
            // Fallback: assignedToUser
            if (!staff) staff = `${details?.assignedToUserFirstName ?? ''} ${details?.assignedToUserLastName ?? ''}`.trim();

            // Use exact frameCompleted date from history as display date
            const fcEntry = history.find(h => h.status === 'frameCompleted');
            if (fcEntry?.dateCreated) {
              enteredAtOverride = fcEntry.dateCreated.split('T')[0];
            }

          } else {
            // Fulfillment
            staff = `${details?.fulfillmentUserFirstName ?? ''} ${details?.fulfillmentUserLastName ?? ''}`.trim();
            if (!staff) staff = `${details?.assignedToUserFirstName ?? ''} ${details?.assignedToUserLastName ?? ''}`.trim();
          }

          infoByOrderNum[num] = {
            staff,
            eventDate: details?.eventDate?.split('T')[0] ?? '',
            enteredAtOverride,
          };
        });
      }

      const staffMap: Record<string, OrderDetail[]> = {};
      deptRows.forEach(({ orderNum, variant, enteredAt, webhookDesigner }) => {
        const info  = infoByOrderNum[orderNum];
        // For design, webhook designer name takes priority over Details lookup
        const staff = (isDesign && webhookDesigner) ? webhookDesigner : (info?.staff || 'Unassigned');
        const displayDate = info?.enteredAtOverride ?? enteredAt;
        if (!staffMap[staff]) staffMap[staff] = [];
        staffMap[staff].push({ orderNum, variant, enteredAt: displayDate, eventDate: info?.eventDate ?? '' });
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
