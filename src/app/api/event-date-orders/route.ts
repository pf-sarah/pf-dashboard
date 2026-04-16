import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
export const maxDuration = 60;

interface ShopifyOrder {
  id: number;
  name: string;
  tags: string;
  customer?: { first_name?: string; last_name?: string };
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
    // Fetch orders created in the last 2 months — scoped to avoid timeout
    const twoMonthsAgo = new Date();
    twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);
    const createdAtMin = twoMonthsAgo.toISOString();

    const all: ShopifyOrder[] = [];
    let url: string | null =
      `https://${domain}/admin/api/2024-10/orders.json?status=any&limit=250` +
      `&created_at_min=${encodeURIComponent(createdAtMin)}` +
      `&fields=id,name,tags,customer`;

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

    // Bucket by event-date tag within selected range
    const byDate: Record<string, {
      count: number; gaCount: number; utahCount: number;
      orders: { name: string; customer: string; isGa: boolean }[];
    }> = {};

    for (const order of all) {
      const tags = order.tags.split(',').map((t: string) => t.trim());
      const isGa = tags.map((t: string) => t.toLowerCase()).includes('ga');
      const customer = [order.customer?.first_name, order.customer?.last_name].filter(Boolean).join(' ') || '—';

      for (const tag of tags) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tag)) continue;
        if (tag < startDate || tag > endDate) continue;
        if (!byDate[tag]) byDate[tag] = { count: 0, gaCount: 0, utahCount: 0, orders: [] };
        byDate[tag].count++;
        if (isGa) byDate[tag].gaCount++; else byDate[tag].utahCount++;
        byDate[tag].orders.push({ name: order.name, customer, isGa });
        break;
      }
    }

    const total     = Object.values(byDate).reduce((s, d) => s + d.count,     0);
    const totalGa   = Object.values(byDate).reduce((s, d) => s + d.gaCount,   0);
    const totalUtah = Object.values(byDate).reduce((s, d) => s + d.utahCount, 0);
    return NextResponse.json({ byDate, total, totalGa, totalUtah, startDate, endDate, scanned: all.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
