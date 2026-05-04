import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Pipeline status rank — lower number = earlier in pipeline = higher priority in FIFO queue
const STATUS_RANK: Record<string, number> = {
  bouquetReceived:      1,
  checkedOn:            2,
  inProgress:           3,
  almostReadyToFrame:   4,
  readyToFrame:         5,
  frameCompleted:       6,
  glued:                7,
  readyToSeal:          8,
  readyToPackage:       9,
  readyToFulfill:       10,
  preparingToShip:      11,
  approved:             12,
  disapproved:          13,
};

// Statuses that qualify an order to enter the resin queue
const QUALIFYING_STATUSES = new Set(Object.keys(STATUS_RANK));

const SHOPIFY_API_VERSION = '2024-01';

async function shopifyFetch(path: string) {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${path}`,
    { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN! } }
  );
  if (!res.ok) throw new Error(`Shopify ${path} → ${res.status}`);
  return res.json();
}

// Fetch all unfulfilled Shopify orders that have at least one line item
// with the product tag "custom resin"
async function fetchResinLineItems(): Promise<ResinLineItem[]> {
  const items: ResinLineItem[] = [];
  let pageInfo: string | null = null;
  let isFirst = true;

  while (true) {
    let url = `/orders.json?status=open&fulfillment_status=unfulfilled,partial&limit=250`;
    if (!isFirst && pageInfo) {
      url = `/orders.json?page_info=${pageInfo}&limit=250`;
    }
    isFirst = false;

    const data = await shopifyFetch(url);
    const orders: ShopifyOrder[] = data.orders ?? [];

    for (const order of orders) {
      // Check if any product in this order has the "custom resin" tag
      for (const li of order.line_items) {
        const tags: string[] = (li.properties ?? [])
          .find((p: { name: string }) => p.name === '_tags')?.value?.split(',').map((t: string) => t.trim()) ?? [];

        // Product tags come from the product object — we use li.product_id to check
        // We'll resolve via Shopify product tags below
        if (!li.fulfillment_status || li.fulfillment_status !== 'fulfilled') {
          items.push({
            shopifyOrderId:     String(order.id),
            shopifyOrderNumber: String(order.order_number),
            lineItemId:         String(li.id),
            lineItemTitle:      li.title ?? '',
            variantTitle:       li.variant_title ?? '',
            quantity:           li.quantity ?? 1,
            fulfillmentStatus:  li.fulfillment_status ?? null,
            productId:          String(li.product_id),
            orderCreatedAt:     order.created_at,
            locationId:         li.fulfillment_service === 'manual' ? null : null,
          });
        }
      }
    }

    // Shopify pagination via Link header
    const linkHeader = (data as { link?: string }).link;
    if (linkHeader && linkHeader.includes('rel="next"')) {
      const match = linkHeader.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
      pageInfo = match?.[1] ?? null;
      if (!pageInfo) break;
    } else {
      break;
    }
  }

  return items;
}

// Batch-check which product IDs have the "custom resin" tag
async function filterResinProducts(productIds: string[]): Promise<Set<string>> {
  const resinProductIds = new Set<string>();
  const unique = [...new Set(productIds)];

  // Shopify allows up to 250 IDs per products.json call
  for (let i = 0; i < unique.length; i += 250) {
    const batch = unique.slice(i, i + 250);
    const data = await shopifyFetch(
      `/products.json?ids=${batch.join(',')}&fields=id,tags&limit=250`
    );
    for (const product of (data.products ?? [])) {
      const tags: string[] = (product.tags ?? '')
        .split(',')
        .map((t: string) => t.trim().toLowerCase());
      if (tags.includes('custom resin')) {
        resinProductIds.add(String(product.id));
      }
    }
  }

  return resinProductIds;
}

export async function GET(req: NextRequest) {
  // Auth: cron secret or Clerk session
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (authHeader !== `Bearer ${cronSecret}`) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[resin-queue-sync] Starting sync...');

    // ── Step 1: Fetch all unfulfilled line items from Shopify ─────────────────
    const allLineItems = await fetchResinLineItems();
    console.log(`[resin-queue-sync] Fetched ${allLineItems.length} unfulfilled line items`);

    // ── Step 2: Filter to only "custom resin" products ────────────────────────
    const productIds = allLineItems.map(li => li.productId);
    const resinProductIds = await filterResinProducts(productIds);
    const resinItems = allLineItems.filter(li => resinProductIds.has(li.productId));
    console.log(`[resin-queue-sync] ${resinItems.length} resin line items after tag filter`);

    if (resinItems.length === 0) {
      return NextResponse.json({ synced: 0, skipped: 0, message: 'No resin line items found' });
    }

    // ── Step 3: Cross-reference with uuid_location_cache for PF status ────────
    // Look up by order number to get status + location + order_date
    const orderNumbers = [...new Set(resinItems.map(li => li.shopifyOrderNumber))];

    const { data: cacheRows, error: cacheError } = await supabase
      .from('uuid_location_cache')
      .select('order_num, status, location, order_date')
      .in('order_num', orderNumbers);

    if (cacheError) throw cacheError;

    // Build a map: order_num → { status, location, order_date }
    // If an order has multiple UUIDs (variants), take the one with the lowest status rank
    // (most progressed in pipeline)
    const orderStatusMap = new Map<string, { status: string; location: string | null; order_date: string | null }>();
    for (const row of (cacheRows ?? [])) {
      const existing = orderStatusMap.get(row.order_num);
      const thisRank = STATUS_RANK[row.status] ?? 999;
      const existingRank = existing ? (STATUS_RANK[existing.status] ?? 999) : 9999;
      if (!existing || thisRank < existingRank) {
        orderStatusMap.set(row.order_num, {
          status:     row.status,
          location:   row.location,
          order_date: row.order_date,
        });
      }
    }

    // ── Step 4: Filter to only orders that qualify (bouquetReceived+) ─────────
    const qualifiedItems = resinItems.filter(li => {
      const entry = orderStatusMap.get(li.shopifyOrderNumber);
      return entry && QUALIFYING_STATUSES.has(entry.status);
    });

    console.log(`[resin-queue-sync] ${qualifiedItems.length} items qualify (bouquetReceived+)`);

    // ── Step 5: Upsert to resin_queue ─────────────────────────────────────────
    const rows = qualifiedItems.map(li => {
      const entry = orderStatusMap.get(li.shopifyOrderNumber);
      return {
        shopify_order_id:          li.shopifyOrderId,
        shopify_order_number:      li.shopifyOrderNumber,
        line_item_id:              li.lineItemId,
        line_item_title:           li.lineItemTitle,
        variant_title:             li.variantTitle,
        quantity:                  li.quantity,
        shopify_fulfillment_status: li.fulfillmentStatus,
        pf_status:                 entry?.status ?? null,
        pf_status_rank:            entry?.status ? (STATUS_RANK[entry.status] ?? 99) : 99,
        origin_location:           entry?.location ?? null,
        order_date:                entry?.order_date ?? li.orderCreatedAt?.split('T')[0] ?? null,
        synced_at:                 new Date().toISOString(),
      };
    });

    const { error: upsertError } = await supabase
      .from('resin_queue')
      .upsert(rows, { onConflict: 'line_item_id' });

    if (upsertError) throw upsertError;

    // ── Step 6: Remove rows that are now fulfilled or no longer resin ─────────
    const activeLineItemIds = qualifiedItems.map(li => li.lineItemId);
    if (activeLineItemIds.length > 0) {
      await supabase
        .from('resin_queue')
        .delete()
        .not('line_item_id', 'in', `(${activeLineItemIds.map(id => `'${id}'`).join(',')})`);
    }

    console.log(`[resin-queue-sync] Upserted ${rows.length} rows`);

    return NextResponse.json({
      synced:    rows.length,
      skipped:   resinItems.length - qualifiedItems.length,
      total:     resinItems.length,
    });

  } catch (err) {
    console.error('[resin-queue-sync] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────

interface ResinLineItem {
  shopifyOrderId:     string;
  shopifyOrderNumber: string;
  lineItemId:         string;
  lineItemTitle:      string;
  variantTitle:       string;
  quantity:           number;
  fulfillmentStatus:  string | null;
  productId:          string;
  orderCreatedAt:     string;
  locationId:         string | null;
}

interface ShopifyOrder {
  id:            number;
  order_number:  number;
  created_at:    string;
  line_items:    ShopifyLineItem[];
}

interface ShopifyLineItem {
  id:                  number;
  title:               string;
  variant_title:       string | null;
  product_id:          number;
  quantity:            number;
  fulfillment_status:  string | null;
  fulfillment_service: string;
  properties:          { name: string; value: string }[];
}
