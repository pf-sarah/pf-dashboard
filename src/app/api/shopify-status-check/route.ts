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
  name: string; // e.g. "#1234"
  fulfillment_status: string | null;
  financial_status: string;
  cancelled_at: string | null;
}

async function fetchAllShopifyOrders(
  domain: string,
  token: string,
  extraParams: string
): Promise<ShopifyOrder[]> {
  const all: ShopifyOrder[] = [];
  let url: string | null =
    `https://${domain}/admin/api/2024-10/orders.json?${extraParams}&limit=250` +
    `&fields=id,name,fulfillment_status,financial_status,cancelled_at`;

  while (url) {
    const response: Response = await fetch(url, {
      headers: { 'X-Shopify-Access-Token': token },
      cache: 'no-store',
    });
    if (!response.ok) break;
    const data = (await response.json()) as { orders: ShopifyOrder[] };
    all.push(...(data.orders ?? []));

    const link: string | null = response.headers.get('link');
    const next: RegExpMatchArray | null = link?.match(/<([^>]+)>;\s*rel="next"/) ?? null;
    url = next ? next[1] : null;
  }
  return all;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const domain = process.env.SHOPIFY_STORE_DOMAIN?.trim();
  const token  = process.env.SHOPIFY_ADMIN_TOKEN?.trim();
  if (!domain || !token) {
    return NextResponse.json({ error: 'Shopify not configured' }, { status: 500 });
  }

  // Debug mode: ?debug=28828 — look up one order directly in Shopify
  const debugOrder = new URL(req.url).searchParams.get('debug');
  if (debugOrder) {
    const safeJson = async (r: Response) => {
      const text = await r.text();
      try { return { status: r.status, body: JSON.parse(text) }; }
      catch { return { status: r.status, body: text }; }
    };
    const [byName, byNum] = await Promise.all([
      fetch(`https://${domain}/admin/api/2024-10/orders.json?name=%23${debugOrder}&status=any&fields=id,name,order_number,fulfillment_status,financial_status,cancelled_at`, {
        headers: { 'X-Shopify-Access-Token': token }, cache: 'no-store',
      }).then(safeJson),
      fetch(`https://${domain}/admin/api/2024-10/orders.json?name=${debugOrder}&status=any&fields=id,name,order_number,fulfillment_status,financial_status,cancelled_at`, {
        headers: { 'X-Shopify-Access-Token': token }, cache: 'no-store',
      }).then(safeJson),
    ]);
    return NextResponse.json({ searchedFor: `#${debugOrder}`, domain, byName, byNum });
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
    }[] = [];

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
          });
        });
      });
    }

    if (!pfOrders.length) {
      return NextResponse.json({ flagged: [], total: 0 });
    }

    // --- 2. Fetch Shopify fulfilled + refunded + cancelled orders in parallel ---
    const twoYearsAgo = new Date(today);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);
    const minDate = fmtDate(twoYearsAgo);

    const [fulfilled, refunded, cancelled] = await Promise.all([
      fetchAllShopifyOrders(domain, token, `status=any&fulfillment_status=fulfilled&created_at_min=${minDate}`),
      fetchAllShopifyOrders(domain, token, `status=any&financial_status=refunded&created_at_min=${minDate}`),
      fetchAllShopifyOrders(domain, token, `status=cancelled&created_at_min=${minDate}`),
    ]);

    // Build a map: shopify order name → shopify status info
    const shopifyMap = new Map<string, { fulfillment: string | null; financial: string; cancelled: boolean }>();
    const addToMap = (orders: ShopifyOrder[]) => {
      orders.forEach(o => {
        const existing = shopifyMap.get(o.name);
        shopifyMap.set(o.name, {
          fulfillment: o.fulfillment_status ?? existing?.fulfillment ?? null,
          financial:   o.financial_status   ?? existing?.financial   ?? '',
          cancelled:   !!o.cancelled_at     || existing?.cancelled   || false,
        });
      });
    };
    addToMap(fulfilled);
    addToMap(refunded);
    addToMap(cancelled);

    // --- 3. Cross-reference ---
    const flagged: {
      num: string;
      name: string;
      variant: string;
      pfStatus: string;
      location: string;
      eventDate: string;
      shopifyFulfillment: string | null;
      shopifyFinancial: string;
      shopifyCancelled: boolean;
      flags: string[];
    }[] = [];

    for (const o of pfOrders) {
      const shopify = shopifyMap.get(o.shopifyName);
      if (!shopify) continue;

      const flags: string[] = [];
      if (shopify.cancelled)                           flags.push('Cancelled');
      if (shopify.financial === 'refunded')            flags.push('Refunded');
      if (shopify.fulfillment === 'fulfilled')         flags.push('Fulfilled');

      if (flags.length === 0) continue;

      flagged.push({
        num:               o.num,
        name:              o.name,
        variant:           o.variant,
        pfStatus:          STATUS_LABELS[o.pfStatus] ?? o.pfStatus,
        location:          o.location,
        eventDate:         o.eventDate,
        shopifyFulfillment: shopify.fulfillment,
        shopifyFinancial:   shopify.financial,
        shopifyCancelled:   shopify.cancelled,
        flags,
      });
    }

    // Sort: cancelled first, then refunded, then fulfilled
    const flagOrder = ['Cancelled', 'Refunded', 'Fulfilled'];
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
