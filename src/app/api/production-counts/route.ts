import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, pfPost, fmtDate } from '@/lib/pf-api';

export const maxDuration = 120;

const PRES_STATUS = 'bouquetReceived';
const FULL_STATUS = 'readyToPackage';
const DESIGN_TRACK = ['frameCompleted', 'approved', 'disapproved'] as const;
const ALL_TARGETS = new Set<string>([PRES_STATUS, FULL_STATUS, ...DESIGN_TRACK]);

const PRESERVATION_STATUSES = new Set([
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
]);
const DESIGN_STATUSES = new Set([
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved',
]);

interface WeeklyReportItem {
  orderNumber?: string | number;
  shopifyOrderNumber?: string | number;
  orderName?: string;
  status?: string;
  location?: string;
  originalOrderDate?: string;
  orderDateUpdated?: string | null;
  variantTitle?: string;
  eventDate?: string;
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

type CapturedItem = {
  orderNum:  string;
  variant:   string;
  orderDate: string;
  eventDate: string;
  enteredAt: string;
  status:    string;
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start    = req.nextUrl.searchParams.get('start');
  const end      = req.nextUrl.searchParams.get('end');
  const location = req.nextUrl.searchParams.get('location') ?? 'Utah';
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  // Mountain Time bounds for filtering orderDateUpdated
  const startMs = new Date(`${start}T00:00:00-06:00`).getTime();
  const endMs   = new Date(`${end}T23:59:59-06:00`).getTime();

  try {
    // Scan last 4 months of WeeklyReport — same coverage as cron
    const paths: string[] = [];
    const today = new Date();
    for (let m = 0; m < 4; m++) {
      const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const lastOfMonth  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
      paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`);
    }

    const allResults = await pfGetAll<WeeklyReportItem[]>(paths);

    // Debug mode: show raw field values for matching-status items
    const debugMode = req.nextUrl.searchParams.get('debug') === '1';
    if (debugMode) {
      const sample: unknown[] = [];
      allResults.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          if (ALL_TARGETS.has(item.status ?? '') && sample.length < 10) {
            sample.push({
              status: item.status,
              location: item.location,
              orderDateUpdated: item.orderDateUpdated,
              originalOrderDate: item.originalOrderDate,
              orderNumber: item.orderNumber ?? item.shopifyOrderNumber,
            });
          }
        });
      });
      return NextResponse.json({ debug: true, startISO: new Date(`${start}T00:00:00-06:00`).toISOString(), endISO: new Date(`${end}T23:59:59-06:00`).toISOString(), sample });
    }

    // byStatus buckets; deduplicate by order_product_key
    const byStatus = new Map<string, Map<string, CapturedItem>>();
    for (const s of ALL_TARGETS) byStatus.set(s, new Map());

    allResults.forEach(items => {
      if (!items) return;
      items.forEach(item => {
        if (!item.status || !ALL_TARGETS.has(item.status)) return;
        if (location !== 'All' && item.location !== location) return;
        if (!item.orderDateUpdated) return;

        const itemMs = new Date(item.orderDateUpdated).getTime();
        if (itemMs < startMs || itemMs > endMs) return;

        const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
        if (!num) return;
        const key = `${num}|${item.variantTitle ?? ''}`;
        const bucket = byStatus.get(item.status)!;
        if (!bucket.has(key)) {
          bucket.set(key, {
            orderNum:  num,
            variant:   item.variantTitle ?? '',
            orderDate: item.originalOrderDate?.split('T')[0] ?? '',
            eventDate: item.eventDate?.split('T')[0] ?? '',
            enteredAt: item.orderDateUpdated.split('T')[0],
            status:    item.status,
          });
        }
      });
    });

    // Deduplicate design rows: prefer frameCompleted > approved/disapproved
    const designMap = new Map<string, CapturedItem>();
    for (const s of DESIGN_TRACK) {
      byStatus.get(s)?.forEach((item, key) => {
        const existing = designMap.get(key);
        if (!existing || s === 'frameCompleted') designMap.set(key, item);
      });
    }

    const DEPT_ENTRIES: [string, Map<string, CapturedItem>][] = [
      ['Preservation', byStatus.get(PRES_STATUS)!],
      ['Design',       designMap],
      ['Fulfillment',  byStatus.get(FULL_STATUS)!],
    ];

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

    for (const [dept, itemMap] of DEPT_ENTRIES) {
      if (!itemMap.size) continue;
      const status    = DEPT_STATUS[dept];
      const deptItems = [...itemMap.values()];
      const uniqueNums = [...new Set(deptItems.map(i => i.orderNum))];
      const infoByNum: Record<string, { staff: string; eventDate: string }> = {};

      const BATCH = 50;
      for (let i = 0; i < uniqueNums.length; i += BATCH) {
        const batch = uniqueNums.slice(i, i + BATCH);
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
          infoByNum[batch[j]] = {
            staff:     item ? staffForStatus(item, status) : '',
            eventDate: item?.eventDate?.split('T')[0] ?? '',
          };
        });
      }

      const staffMap: Record<string, OrderDetail[]> = {};
      deptItems.forEach(({ orderNum, variant, enteredAt, eventDate }) => {
        const info  = infoByNum[orderNum];
        const staff = info?.staff || 'Unassigned';
        if (!staffMap[staff]) staffMap[staff] = [];
        staffMap[staff].push({
          orderNum,
          variant,
          enteredAt,
          eventDate: info?.eventDate || eventDate,
        });
      });

      result[dept] = Object.entries(staffMap)
        .map(([staff, orders]) => ({
          staff,
          count:  orders.length,
          orders: orders.sort((a, b) =>
            a.orderNum.localeCompare(b.orderNum, undefined, { numeric: true })
          ),
        }))
        .sort((a, b) => b.count - a.count);
    }

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
