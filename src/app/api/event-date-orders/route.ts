import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
export const maxDuration = 60;

interface ShopifyOrder {
  id: number;
  name: string;
  tags: string;
  customer?: { first_name?: string; last_name?: string };
}

// Fetch ALL orders created in a date window in one paginated pass
async function fetchAllOrdersInRange(
  domain: string,
  token: string,
  createdAtMin: string,
  createdAtMax: string,
): Promise<ShopifyOrder[]> {
  const all: ShopifyOrder[] = [];
  let url: string | null =
    `https://${domain}/admin/api/2024-10/orders.json?status=any` +
    `&created_at_min=${encodeURIComponent(createdAtMin)}` +
    `&created_at_max=${encodeURIComponent(createdAtMax)}` +
    `&limit=250&fields=id,name,tags,customer`;
  while (url) {
    const res = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
      cache: 'no-store',
    });
    if (!res.ok) break;
    const data = (await res.json()) as { orders: ShopifyOrder[] };
    all.push(...(data.orders ?? []));
    const link = res.headers.get('link');
    const next = link?.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }
  return all;
}

// Extract event-date tags (ISO date format YYYY-MM-DD) from a comma-separated tag string
function extractEventDates(tags: string): string[] {
  return tags.split(',')
    .map(t => t.trim())
    .filter(t => /^\d{4}-\d{2}-\d{2}$/.test(t));
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

  // Validate range
  const start = new Date(startDate + 'T00:00:00Z');
  const end   = new Date(endDate   + 'T23:59:59Z');
  const diffDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 60) return NextResponse.json({ error: 'Date range too large (max 60 days)' }, { status: 400 });

  try {
    // Single paginated fetch — orders whose event date tag falls in the range.
    // We fetch orders created in a wide window (event dates are typically set at order time,
    // so we look back 18 months to catch all orders with event dates in the requested range).
    const lookbackMin = new Date(start);
    lookbackMin.setMonth(lookbackMin.getMonth() - 18);
    const createdAtMin = lookbackMin.toISOString();
    const createdAtMax = new Date().toISOString(); // up to now

    const allOrders = await fetchAllOrdersInRange(domain, token, createdAtMin, createdAtMax);

    // Bucket by event date tag, filtering to only dates within [startDate, endDate]
    const byDate: Record<string, {
      count: number;
      gaCount: number;
      utahCount: number;
      orders: { name: string; customer: string; isGa: boolean }[];
    }> = {};

    for (const order of allOrders) {
      const eventDates = extractEventDates(order.tags);
      const isGa = order.tags.split(',').map(t => t.trim().toLowerCase()).includes('ga');
      const customer = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || '—';

      for (const date of eventDates) {
        if (date < startDate || date > endDate) continue;
        if (!byDate[date]) byDate[date] = { count: 0, gaCount: 0, utahCount: 0, orders: [] };
        byDate[date].count++;
        if (isGa) byDate[date].gaCount++; else byDate[date].utahCount++;
        byDate[date].orders.push({ name: order.name, customer, isGa });
      }
    }

    const total     = Object.values(byDate).reduce((s, d) => s + d.count,     0);
    const totalGa   = Object.values(byDate).reduce((s, d) => s + d.gaCount,   0);
    const totalUtah = Object.values(byDate).reduce((s, d) => s + d.utahCount, 0);

    return NextResponse.json({ byDate, total, totalGa, totalUtah, startDate, endDate });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
