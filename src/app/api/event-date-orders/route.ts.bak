import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

export const maxDuration = 60;

interface ShopifyOrder {
  id: number;
  name: string;
  tags: string;
  customer?: { first_name?: string; last_name?: string };
}

function fmtDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function datesInRange(start: string, end: string): string[] {
  const dates: string[] = [];
  const cur = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cur <= endDate) {
    dates.push(fmtDate(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

async function fetchOrdersWithTag(
  domain: string,
  token: string,
  tag: string
): Promise<ShopifyOrder[]> {
  const all: ShopifyOrder[] = [];
  let url: string | null =
    `https://${domain}/admin/api/2024-10/orders.json?status=any&tag=${encodeURIComponent(tag)}` +
    `&limit=250&fields=id,name,tags,customer`;

  while (url) {
    const res: Response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
      cache: 'no-store',
    });
    if (!res.ok) break;
    const data = (await res.json()) as { orders: ShopifyOrder[] };
    all.push(...(data.orders ?? []));
    const link: string | null = res.headers.get('link');
    const next: RegExpMatchArray | null = link?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
    url = next ? next[1] : null;
  }
  return all;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token  = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!domain || !token) return NextResponse.json({ error: 'Shopify not configured' }, { status: 500 });

  const startDate = req.nextUrl.searchParams.get('start');
  const endDate   = req.nextUrl.searchParams.get('end');
  if (!startDate || !endDate) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  try {
    const dates = datesInRange(startDate, endDate);
    if (dates.length > 60) return NextResponse.json({ error: 'Date range too large (max 60 days)' }, { status: 400 });

    // Fetch all dates in parallel batches of 10
    const byDate: Record<string, { count: number; orders: { name: string; customer: string }[] }> = {};

    const BATCH = 10;
    for (let i = 0; i < dates.length; i += BATCH) {
      const batch = dates.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(date => fetchOrdersWithTag(domain, token, date))
      );
      results.forEach((orders, j) => {
        const date = batch[j];
        byDate[date] = {
          count: orders.length,
          orders: orders.map(o => ({
            name: o.name,
            customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || '—',
          })),
        };
      });
    }

    const total = Object.values(byDate).reduce((s, d) => s + d.count, 0);
    return NextResponse.json({ byDate, total, startDate, endDate });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
