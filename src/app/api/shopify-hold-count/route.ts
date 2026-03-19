import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';

const LOCATION_TAG: Record<string, string> = {
  Utah:    'utah',
  Georgia: 'ga',
};

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const location = req.nextUrl.searchParams.get('location') ?? 'All';
  const domain   = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token    = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!domain || !token) return NextResponse.json({ count: 0, orders: [] });

  try {
    const res = await fetch(
      `https://${domain}/admin/api/2024-10/orders.json?status=open&tag=hold&limit=250&fields=id,name,tags,customer`,
      { headers: { 'X-Shopify-Access-Token': token }, cache: 'no-store' }
    );
    if (!res.ok) return NextResponse.json({ count: 0, orders: [] });

    const data = await res.json() as {
      orders: { id: number; name: string; tags: string; customer?: { first_name?: string; last_name?: string } }[]
    };
    let orders = data.orders ?? [];

    const locTag = LOCATION_TAG[location];
    if (locTag) {
      orders = orders.filter(o =>
        o.tags.toLowerCase().split(',').map(t => t.trim()).includes(locTag)
      );
    }

    return NextResponse.json({
      count: orders.length,
      orders: orders.map(o => ({
        name:     o.name,
        customer: [o.customer?.first_name, o.customer?.last_name].filter(Boolean).join(' ') || null,
        tags:     o.tags,
      })),
    });
  } catch {
    return NextResponse.json({ count: 0, orders: [] });
  }
}
