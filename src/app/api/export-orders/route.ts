import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, fmtDate } from '@/lib/pf-api';

export const maxDuration = 120;

const EXPORT_STATUSES = new Set(['readyToFrame', 'readyToSeal']);

interface WeeklyReportItem {
  orderNumber?: string | number;
  shopifyOrderNumber?: string | number;
  orderName?: string;
  status?: string;
  location?: string;
  originalOrderDate?: string;
  variantTitle?: string;
  eventDate?: string;
}

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
    // Build monthly date-range paths going back 18 months
    const paths: string[] = [];
    const today = new Date();
    for (let m = 0; m < 18; m++) {
      const y = today.getFullYear();
      const mo = today.getMonth() - m;
      const firstOfMonth = new Date(y, mo, 1);
      const lastOfMonth = m === 0 ? today : new Date(y, mo + 1, 0);
      paths.push(
        `/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`
      );
    }

    const seen = new Set<string>();
    const orders: { num: string; name: string; variant: string; status: string; location: string; orderDate: string; eventDate: string }[] = [];

    // Fetch all months in parallel batches of 9
    for (let i = 0; i < paths.length; i += 9) {
      const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 9));
      results.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          if (!item.status || !EXPORT_STATUSES.has(item.status)) return;
          const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
          if (!num) return;
          const id = `${num}|${item.variantTitle ?? ''}`;
          if (seen.has(id)) return;
          seen.add(id);
          orders.push({
            num,
            name: item.orderName ?? '',
            variant: item.variantTitle ?? '',
            status: item.status,
            location: item.location ?? '',
            orderDate: item.originalOrderDate?.split('T')[0] ?? '',
            eventDate: item.eventDate?.split('T')[0] ?? '',
          });
        });
      });
    }

    const STATUS_LABELS: Record<string, string> = {
      readyToFrame: 'Ready to Frame',
      readyToSeal: 'Ready to Seal',
    };

    const header = ['Order #', 'Customer', 'Frame', 'Status', 'Location', 'Event Date', 'Order Date'].join(',');
    const rows = orders
      .sort((a, b) => {
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
          escCsv(o.eventDate),
          escCsv(o.orderDate),
        ].join(',')
      );

    const csv = [header, ...rows].join('\n');

    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="pf-export-ready-orders-${fmtDate(today)}.csv"`,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
