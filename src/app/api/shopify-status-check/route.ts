import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, fmtDate } from '@/lib/pf-api';

export const maxDuration = 120;

const EXPORT_STATUSES = new Set(['readyToFrame', 'readyToSeal']);
const STATUS_LABELS: Record<string, string> = {
  readyToFrame: 'Ready to Frame',
  readyToSeal:  'Ready to Seal',
};

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

interface ShopifyOrder {
  name: string;
  fulfillment_status: string | null;
  financial_status: string;
  cancelled_at: string | null;
  total_price: string;
  shipping_lines: { title: string }[];
}

async function shopifyLookup(
  domain: string,
  token: string,
  orderName: string
): Promise<ShopifyOrder | null> {
  const encoded = encodeURIComponent(orderName);
  const res = await fetch(
    `https://${domain}/admin/api/2024-10/orders.json?name=${encoded}&status=any` +
    `&fields=id,name,fulfillment_status,financial_status,cancelled_at,total_price,shipping_lines`,
    { headers: { 'X-Shopify-Access-Token': token }, cache: 'no-store' }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { orders: ShopifyOrder[] };
  return data.orders?.[0] ?? null;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token  = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!domain || !token) {
    return NextResponse.json({ error: 'Shopify not configured' }, { status: 500 });
  }

  // Debug mode: ?debug=28828
  const debugOrder = new URL(req.url).searchParams.get('debug');
  if (debugOrder) {
    const safeJson = async (r: Response) => {
      const text = await r.text();
      try { return { status: r.status, body: JSON.parse(text) }; }
      catch { return { status: r.status, body: text }; }
    };
    const result = await fetch(
      `https://${domain}/admin/api/2024-10/orders.json?name=%23${debugOrder}&status=any` +
      `&fields=id,name,order_number,fulfillment_status,financial_status,cancelled_at,total_price,shipping_lines`,
      { headers: { 'X-Shopify-Access-Token': token }, cache: 'no-store' }
    ).then(safeJson);
    return NextResponse.json({ searchedFor: `#${debugOrder}`, domain, result });
  }

  try {
    // --- 1. Fetch PF orders in readyToFrame / readyToSeal ---
    const paths: string[] = [];
    const today = new Date();
    for (let m = 0; m < 18; m++) {
      const y  = today.getFullYear();
      const mo = today.getMonth() - m;
      const firstOfMonth = new Date(y, mo, 1);
      const lastOfMonth  = m === 0 ? today : new Date(y, mo + 1, 0);
      paths.push(
        `/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`
      );
    }

    const seen = new Set<string>();
    const pfOrders: {
      num: string;
      shopifyName: string;
      name: string;
      variant: string;
      pfStatus: string;
      location: string;
      eventDate: string;
      orderDate: string;
    }[] = [];

    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);

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
          pfOrders.push({
            num,
            shopifyName: `#${num}`,
            name:      item.orderName ?? '',
            variant:   item.variantTitle ?? '',
            pfStatus:  item.status,
            location:  item.location ?? '',
            eventDate: item.eventDate?.split('T')[0] ?? '',
            orderDate: item.originalOrderDate?.split('T')[0] ?? '',
          });
        });
      });
    }

    if (!pfOrders.length) {
      return NextResponse.json({ flagged: [], total: 0, flaggedCount: 0 });
    }

    // --- 2. Look up each PF order in Shopify by name, in batches of 20 ---
    const flagged: {
      num: string;
      name: string;
      variant: string;
      pfStatus: string;
      location: string;
      eventDate: string;
      orderDate: string;
      flags: string[];
    }[] = [];

    const BATCH = 20;
    for (let i = 0; i < pfOrders.length; i += BATCH) {
      const batch = pfOrders.slice(i, i + BATCH);
      const shopifyResults = await Promise.all(
        batch.map(o => shopifyLookup(domain, token, o.shopifyName))
      );

      shopifyResults.forEach((shopify, j) => {
        const o = batch[j];
        const flags: string[] = [];

        // PF-side check: order placed more than 12 months ago
        if (o.orderDate && new Date(o.orderDate) < twelveMonthsAgo) {
          flags.push('Order > 12 mo');
        }

        // Shopify-side checks
        if (shopify) {
          if (shopify.cancelled_at)                       flags.push('Cancelled');
          if (shopify.financial_status === 'refunded')    flags.push('Refunded');
          if (shopify.fulfillment_status === 'fulfilled') flags.push('Fulfilled');

          // Pickup in store + $0 order total
          const isPickup =
            shopify.shipping_lines.length === 0 ||
            shopify.shipping_lines.some(l => l.title?.toLowerCase().includes('pickup'));
          const isZero = parseFloat(shopify.total_price ?? '1') === 0;
          if (isPickup && isZero) flags.push('Pickup + $0');
        }

        if (flags.length === 0) return;

        flagged.push({
          num:       o.num,
          name:      o.name,
          variant:   o.variant,
          pfStatus:  STATUS_LABELS[o.pfStatus] ?? o.pfStatus,
          location:  o.location,
          eventDate: o.eventDate,
          orderDate: o.orderDate,
          flags,
        });
      });
    }

    // Sort priority: Cancelled → Refunded → Pickup+$0 → Old order → Fulfilled
    const flagOrder = ['Cancelled', 'Refunded', 'Pickup + $0', 'Order > 12 mo', 'Fulfilled'];
    flagged.sort((a, b) => {
      const ai = Math.min(...a.flags.map(f => flagOrder.indexOf(f)));
      const bi = Math.min(...b.flags.map(f => flagOrder.indexOf(f)));
      return ai - bi || a.eventDate.localeCompare(b.eventDate);
    });

    return NextResponse.json({ flagged, total: pfOrders.length, flaggedCount: flagged.length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
