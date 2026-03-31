import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfPost, pfGet } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 120;

interface SearchResponse {
  items: { uuid?: string }[];
}

interface DetailsUpload {
  uploadType: string;
  uploadedByUserFirstName?: string;
  uploadedByUserLastName?: string;
}

interface DetailsHistory {
  status: string;
  dateCreated: string;
}

interface Details {
  variantTitle?: string;
  eventDate?: string;
  preservationUserFirstName?: string;
  preservationUserLastName?: string;
  assignedToUserFirstName?: string;
  assignedToUserLastName?: string;
  fulfillmentUserFirstName?: string;
  fulfillmentUserLastName?: string;
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

function uploadStaff(details: Details, type: 'bouquet' | 'frame'): string {
  const upload = details.orderProductUploads?.find(u => u.uploadType === type);
  if (!upload) return '';
  return `${upload.uploadedByUserFirstName ?? ''} ${upload.uploadedByUserLastName ?? ''}`.trim();
}

interface DetailsHistoryWithUser extends DetailsHistory {
  userFirstName?: string;
  userLastName?: string;
}

function historyEntry(details: Details, status: string): DetailsHistoryWithUser | null {
  return (details.history as DetailsHistoryWithUser[] | undefined)?.find(h => h.status === status) ?? null;
}


function historyUser(details: Details, status: string): string {
  const entry = historyEntry(details, status);
  if (!entry?.userFirstName) return '';
  return `${entry.userFirstName} ${entry.userLastName ?? ''}`.trim();
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start    = req.nextUrl.searchParams.get('start');
  const end      = req.nextUrl.searchParams.get('end');
  const location = req.nextUrl.searchParams.get('location') ?? 'Utah';
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  // Supabase first_seen_at is when our snapshot ran (UTC), not when the status changed.
  // We buffer by 7 days on each side so we catch orders regardless of when the snapshot ran.
  // The exact frameCompleted date is then verified from the PF history array (Mountain Time).
  const BUFFER_MS = 7 * 24 * 60 * 60 * 1000;
  const startISO = new Date(new Date(`${start}T00:00:00-06:00`).getTime() - BUFFER_MS).toISOString();
  const endISO   = new Date(new Date(`${end}T23:59:59-06:00`).getTime() + BUFFER_MS).toISOString();

  const queryStatus = (status: string) => {
    const q = supabase
      .from('order_status_history')
      .select('order_num')
      .eq('status', status)
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);
    if (location !== 'All') q.eq('location', location);
    return q.then(r => [...new Set((r.data ?? []).map(x => x.order_num))]);
  };

  try {
    // For design: also include approved/disapproved as candidates —
    // orders often move readyToFrame→frameCompleted→approved same day,
    // so the cron never captures frameCompleted. We use the history array
    // to find the real frameCompleted date regardless of current status.
    // Cast a wide net for design candidates — an order can move through
    // frameCompleted → approved → glued → readyToSeal all in one day.
    // We verify the actual frameCompleted date from PF history for each one.
    const DESIGN_CANDIDATE_STATUSES = [
      'frameCompleted', 'approved', 'disapproved', 'noResponse',
      'glued', 'readyToSeal', 'readyToPackage',
    ];

    const [presNums, fullNums, ...designBuckets] = await Promise.all([
      queryStatus('bouquetReceived'),
      queryStatus('readyToPackage'),
      ...DESIGN_CANDIDATE_STATUSES.map(queryStatus),
    ]);

    const designNums = [...new Set(designBuckets.flat())];

    const allNums = [...new Set([...presNums, ...designNums, ...fullNums])];
    if (!allNums.length) {
      return NextResponse.json({ Preservation: [], Design: [], Fulfillment: [] });
    }

    // ── Fetch Details for all orders ─────────────────────────────────────────
    const BATCH = 20;
    const detailsByNum: Record<string, Details> = {};

    for (let i = 0; i < allNums.length; i += BATCH) {
      const batch = allNums.slice(i, i + BATCH);

      const searches = await Promise.all(
        batch.map(num =>
          pfPost<SearchResponse>('/OrderProducts/Search', {
            searchTerm: num, pageNumber: 1, pageSize: 5,
          }).catch(() => null)
        )
      );

      const detailsList = await Promise.all(
        searches.map(s => {
          const uuid = s?.items?.[0]?.uuid;
          return uuid
            ? pfGet<Details>(`/OrderProducts/Details/${uuid}`).catch(() => null)
            : null;
        })
      );

      batch.forEach((num, j) => {
        if (detailsList[j]) detailsByNum[num] = detailsList[j]!;
      });
    }

    // ── Build staff rows, verified against exact history dates ────────────────
    function buildDept(
      orderNums: string[],
      historyStatus: string,
      getStaff: (d: Details) => string,
    ): StaffRow[] {
      const staffMap: Record<string, OrderDetail[]> = {};

      orderNums.forEach(num => {
        const details = detailsByNum[num];
        if (!details) return;

        const rawDate = historyEntry(details, historyStatus)?.dateCreated;
        if (!rawDate) return;
        // Convert UTC timestamp to Mountain Time date string for comparison
        const exactDate = new Date(rawDate).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
        if (exactDate < start! || exactDate > end!) return;

        const staff     = getStaff(details) || 'Unassigned';
        const variant   = details.variantTitle ?? '';
        const eventDate = details.eventDate?.split('T')[0] ?? '';

        if (!staffMap[staff]) staffMap[staff] = [];
        staffMap[staff].push({ orderNum: num, variant, enteredAt: exactDate, eventDate });
      });

      return Object.entries(staffMap)
        .map(([staff, orders]) => ({
          staff,
          count:  orders.length,
          orders: orders.sort((a, b) => a.enteredAt.localeCompare(b.enteredAt)),
        }))
        .sort((a, b) => b.count - a.count);
    }

    return NextResponse.json({
      Preservation: buildDept(
        presNums,
        'bouquetReceived',
        d =>
          uploadStaff(d, 'bouquet') ||
          `${d.preservationUserFirstName ?? ''} ${d.preservationUserLastName ?? ''}`.trim() ||
          `${d.assignedToUserFirstName ?? ''} ${d.assignedToUserLastName ?? ''}`.trim(),
      ),
      Design: buildDept(
        designNums,
        'frameCompleted',
        d =>
          historyUser(d, 'frameCompleted') ||
          uploadStaff(d, 'frame') ||
          `${d.assignedToUserFirstName ?? ''} ${d.assignedToUserLastName ?? ''}`.trim(),
      ),
      Fulfillment: buildDept(
        fullNums,
        'readyToPackage',
        d =>
          `${d.fulfillmentUserFirstName ?? ''} ${d.fulfillmentUserLastName ?? ''}`.trim() ||
          `${d.assignedToUserFirstName ?? ''} ${d.assignedToUserLastName ?? ''}`.trim(),
      ),
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
