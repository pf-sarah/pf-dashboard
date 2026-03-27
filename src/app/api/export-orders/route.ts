import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, pfPost, fmtDate } from '@/lib/pf-api';

export const maxDuration = 120;

const EXPORT_STATUSES = ['readyToFrame', 'readyToSeal'] as const;

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
  fulfillmentUserFirstName?: string;
  fulfillmentUserLastName?: string;
}

interface SearchResponse {
  items: SearchItem[];
}

type OrderRow = {
  num: string;
  id: string;
  name: string;
  variant: string;
  status: string;
  location: string;
  orderDate: string;
  eventDate: string;
  enteredAt: string;
  staff: string;
};

function escCsv(val: string): string {
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // Build monthly date-range paths going back 36 months
    const paths: string[] = [];
    const today = new Date();
    for (let m = 0; m < 36; m++) {
      const y = today.getFullYear();
      const mo = today.getMonth() - m;
      const firstOfMonth = new Date(y, mo, 1);
      const lastOfMonth = m === 0 ? today : new Date(y, mo + 1, 0);
      paths.push(
        `/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`
      );
    }

    const exportStatuses = new Set<string>(EXPORT_STATUSES);
    const seen = new Set<string>();
    const orders: OrderRow[] = [];

    for (let i = 0; i < paths.length; i += 8) {
      const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 8));
      results.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          if (!item.status || !exportStatuses.has(item.status)) return;
          const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
          if (!num) return;
          const id = `${num}|${item.variantTitle ?? ''}`;
          if (seen.has(id)) return;
          seen.add(id);
          orders.push({
            id,
            num,
            name: item.orderName ?? '',
            variant: item.variantTitle ?? '',
            status: item.status,
            location: item.location ?? '',
            orderDate: item.originalOrderDate?.split('T')[0] ?? '',
            eventDate: item.eventDate?.split('T')[0] ?? '',
            enteredAt: '',
            staff: '',
          });
        });
      });
      if (orders.length >= 2000) break;
    }

    // Batch-search each order for staff info
    const BATCH = 50;
    for (let i = 0; i < orders.length; i += BATCH) {
      const batch = orders.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(o =>
          pfPost<SearchResponse>('/OrderProducts/Search', {
            searchTerm: o.num,
            pageNumber: 1,
            pageSize: 1,
          }).catch(() => null)
        )
      );
      results.forEach((data, j) => {
        const item = data?.items?.[0];
        if (!item) return;
        // readyToFrame → design staff; readyToSeal → fulfillment staff
        if (batch[j].status === 'readyToFrame') {
          const fn = item.assignedToUserFirstName ?? '';
          const ln = item.assignedToUserLastName ?? '';
          batch[j].staff = `${fn} ${ln}`.trim();
        } else {
          const fn = item.fulfillmentUserFirstName ?? '';
          const ln = item.fulfillmentUserLastName ?? '';
          batch[j].staff = `${fn} ${ln}`.trim();
        }
      });
    }

    // Build CSV
    const STATUS_LABELS: Record<string, string> = {
      readyToFrame: 'Ready to Frame',
      readyToSeal: 'Ready to Seal',
    };

    const header = ['Order #', 'Customer', 'Frame', 'Status', 'Location', 'Staff', 'Event Date', 'Order Date'].join(',');
    const rows = orders
      .sort((a, b) => {
        // Sort by status first, then event date
        if (a.status !== b.status) return a.status.localeCompare(b.status);
        if (a.eventDate && b.eventDate) return a.eventDate.localeCompare(b.eventDate);
        if (a.eventDate) return -1;
        if (b.eventDate) return 1;
        return 0;
      })
      .map(o =>
        [
          escCsv(o.num),
          escCsv(o.name),
          escCsv(o.variant),
          escCsv(STATUS_LABELS[o.status] ?? o.status),
          escCsv(o.location),
          escCsv(o.staff),
          escCsv(o.eventDate),
          escCsv(o.orderDate),
        ].join(',')
      );

    const csv = [header, ...rows].join('\n');
    const date = fmtDate(today);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="pf-export-ready-orders-${date}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
