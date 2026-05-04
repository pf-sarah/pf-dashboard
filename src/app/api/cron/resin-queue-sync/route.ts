import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PIPELINE_STATUSES = [
  'bouquetReceived','checkedOn','inProgress','almostReadyToFrame',
  'readyToFrame','frameCompleted','glued','readyToSeal',
  'readyToPackage','readyToFulfill','preparingToShip','approved','disapproved',
];

const STATUS_RANK: Record<string, number> = {
  bouquetReceived:1, checkedOn:2, inProgress:3, almostReadyToFrame:4,
  readyToFrame:5, frameCompleted:6, glued:7, readyToSeal:8,
  readyToPackage:9, readyToFulfill:10, preparingToShip:11, approved:12, disapproved:13,
};

const RESIN_PRODUCT_IDS = new Set([
  '8199232553130',
  '7880850047146',
]);

const SHOPIFY_API_VERSION = '2024-01';

async function shopifyFetch(path: string) {
  const res = await fetch(
    `https://${process.env.SHOPIFY_STORE_DOMAIN}/admin/api/${SHOPIFY_API_VERSION}${path}`,
    { headers: { 'X-Shopify-Access-Token': process.env.SHOPIFY_ADMIN_TOKEN! } }
  );
  if (!res.ok) throw new Error(`Shopify ${path} → ${res.status}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    console.log('[resin-queue-sync] Starting sync...');
    const resinLineItems: ResinLineItem[] = [];
    const seen = new Set<string>();

    for (const status of PIPELINE_STATUSES) {
      let pageInfo: string | null = null;
      let isFirst = true;

      while (true) {
        let url: string;
        if (isFirst) {
          url = `/orders.json?tag=${status}&status=open&limit=250&fields=id,order_number,created_at,tags,line_items`;
        } else {
          url = `/orders.json?page_info=${pageInfo}&limit=250&fields=id,order_number,created_at,tags,line_items`;
        }
        isFirst = false;

        const data = await shopifyFetch(url);
        const orders: ShopifyOrder[] = data.orders ?? [];

        for (const order of orders) {
          const orderTags = (order.tags ?? '').split(',').map((t: string) => t.trim());
          const pipelineStatus = PIPELINE_STATUSES.find(s => orderTags.includes(s)) ?? status;

          for (const li of order.line_items) {
            if (!RESIN_PRODUCT_IDS.has(String(li.product_id))) continue;
            if (li.fulfillment_status === 'fulfilled') continue;
            if (seen.has(String(li.id))) continue;
            seen.add(String(li.id));

            resinLineItems.push({
              shopifyOrderId:     String(order.id),
              shopifyOrderNumber: String(order.order_number),
              lineItemId:         String(li.id),
              lineItemTitle:      li.title ?? '',
              variantTitle:       li.variant_title ?? null,
              quantity:           li.quantity ?? 1,
              fulfillmentStatus:  li.fulfillment_status ?? null,
              productId:          String(li.product_id),
              orderCreatedAt:     order.created_at,
              pipelineStatus,
            });
          }
        }

        const linkHeader = (data as { link?: string }).link ?? '';
        if (linkHeader.includes('rel="next"')) {
          const match = linkHeader.match(/page_info=([^&>]+)[^>]*>;\s*rel="next"/);
          pageInfo = match?.[1] ?? null;
          if (!pageInfo) break;
        } else {
          break;
        }
      }
    }

    console.log(`[resin-queue-sync] Found ${resinLineItems.length} unfulfilled resin line items`);

    if (resinLineItems.length === 0) {
      return NextResponse.json({ synced: 0, message: 'No unfulfilled resin line items found with pipeline status tags' });
    }

    const orderNumbers = [...new Set(resinLineItems.map(li => li.shopifyOrderNumber))];

    const { data: cacheRows, error: cacheError } = await supabase
      .from('uuid_location_cache')
      .select('order_num, status, location, order_date')
      .in('order_num', orderNumbers);

    if (cacheError) throw cacheError;

    const orderMap = new Map<string, { location: string | null; order_date: string | null; status: string }>();
    for (const row of (cacheRows ?? [])) {
      const existing = orderMap.get(row.order_num);
      const thisRank = STATUS_RANK[row.status] ?? 999;
      const existingRank = existing ? (STATUS_RANK[existing.status] ?? 999) : 9999;
      if (!existing || thisRank < existingRank) {
        orderMap.set(row.order_num, { location: row.location, order_date: row.order_date, status: row.status });
      }
    }

    console.log(`[resin-queue-sync] Matched ${orderMap.size}/${orderNumbers.length} orders in cache`);

    const rows = resinLineItems.map(li => {
      const cache = orderMap.get(li.shopifyOrderNumber);
      return {
        shopify_order_id:           li.shopifyOrderId,
        shopify_order_number:       li.shopifyOrderNumber,
        line_item_id:               li.lineItemId,
        line_item_title:            li.lineItemTitle,
        variant_title:              li.variantTitle,
        quantity:                   li.quantity,
        shopify_fulfillment_status: li.fulfillmentStatus,
        pf_status:                  cache?.status ?? li.pipelineStatus,
        pf_status_rank:             STATUS_RANK[cache?.status ?? li.pipelineStatus] ?? 99,
        origin_location:            cache?.location ?? null,
        order_date:                 cache?.order_date ?? li.orderCreatedAt?.split('T')[0] ?? null,
        synced_at:                  new Date().toISOString(),
      };
    });

    const { error: upsertError, data: upsertData } = await supabase
      .from('resin_queue')
      .upsert(rows, { onConflict: 'line_item_id' })
      .select('line_item_id');

    if (upsertError) throw new Error('Upsert failed: ' + JSON.stringify(upsertError));
    const insertedCount = upsertData?.length ?? 0;

    const activeIds = resinLineItems.map(li => li.lineItemId);
    if (activeIds.length > 0) {
      await supabase
        .from('resin_queue')
        .delete()
        .not('line_item_id', 'in', `(${activeIds.map(id => `'${id}'`).join(',')})`);
    }

    return NextResponse.json({
      synced:        rows.length,
      inserted:      insertedCount,
      ordersMatched: orderMap.size,
      ordersTotal:   orderNumbers.length,
      unmatched:     orderNumbers.length - orderMap.size,
    });

  } catch (err) {
    console.error('[resin-queue-sync] Error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

interface ResinLineItem {
  shopifyOrderId:     string;
  shopifyOrderNumber: string;
  lineItemId:         string;
  lineItemTitle:      string;
  variantTitle:       string | null;
  quantity:           number;
  fulfillmentStatus:  string | null;
  productId:          string;
  orderCreatedAt:     string;
  pipelineStatus:     string;
}

interface ShopifyOrder {
  id:           number;
  order_number: number;
  created_at:   string;
  tags:         string;
  line_items:   ShopifyLineItem[];
}

interface ShopifyLineItem {
  id:                 number;
  title:              string;
  variant_title:      string | null;
  product_id:         number;
  quantity:           number;
  fulfillment_status: string | null;
}
