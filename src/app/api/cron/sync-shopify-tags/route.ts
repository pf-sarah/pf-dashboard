import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const maxDuration = 300;

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const SHOPIFY_API = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PIPELINE_STATUSES = [
  "bouquetReceived", "checkedOn", "progress", "almostReadyToFrame",
  "readyToFrame", "noResponse", "disapproved", "approved",
  "glued", "readyToSeal", "readyToPackage", "readyToFulfill",
  "preparingToBeShipped", "shipped", "waitingForResponse"
];

interface ShopifyOrder {
  id: number;
  name: string;
  tags: string;
}

async function fetchShopifyOrdersSince(date: string): Promise<Map<string, ShopifyOrder>> {
  const orderMap = new Map<string, ShopifyOrder>();
  let pageUrl = `/orders.json?status=any&fields=id,name,tags&limit=250&created_at_min=${date}`;

  while (pageUrl) {
    const res = await fetch(`${SHOPIFY_API}${pageUrl}`, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Shopify bulk fetch failed: ${res.status}`);

    const data = await res.json();
    const orders: ShopifyOrder[] = data.orders ?? [];
    for (const order of orders) {
      const num = order.name.replace(/^#/, "");
      orderMap.set(num, order);
    }

    const linkHeader = res.headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      const nextUrl = new URL(nextMatch[1]);
      pageUrl = nextUrl.pathname.replace(`/admin/api/2024-01`, "") + nextUrl.search;
    } else {
      pageUrl = "";
    }
  }

  return orderMap;
}

async function shopifyPut(path: string, body: unknown) {
  const res = await fetch(`${SHOPIFY_API}${path}`, {
    method: "PUT",
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify PUT ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const dryRun = searchParams.get("dryRun") === "true";

  // Only fetch Shopify orders from the last 18 months
  const since = new Date();
  since.setMonth(since.getMonth() - 18);
  const sinceStr = since.toISOString();

  // 1. Pull pipeline orders from order_status_history
  const { data: cacheRows, error: dbError } = await supabase
    .from("order_status_history")
    .select("order_num, status")
    .in("status", PIPELINE_STATUSES);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Build map: orderNum -> Set of statuses
  const orderStatuses = new Map<string, Set<string>>();
  for (const row of cacheRows ?? []) {
    if (!row.order_num || !row.status) continue;
    if (!orderStatuses.has(row.order_num)) orderStatuses.set(row.order_num, new Set());
    orderStatuses.get(row.order_num)!.add(row.status);
  }

  // 2. Bulk fetch Shopify orders from last 18 months
  let shopifyOrders: Map<string, ShopifyOrder>;
  try {
    shopifyOrders = await fetchShopifyOrdersSince(sinceStr);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Shopify fetch failed: ${message}` }, { status: 500 });
  }

  // 3. Update tags for orders that need it
  const results = {
    updated: 0,
    skipped: 0,
    notFound: 0,
    errors: [] as string[],
    updatedOrders: [] as string[],
  };

  for (const [orderNum, statusSet] of orderStatuses.entries()) {
    const shopifyOrder = shopifyOrders.get(orderNum);
    if (!shopifyOrder) {
      results.notFound++;
      continue;
    }

    const currentTags: string[] = shopifyOrder.tags
      ? shopifyOrder.tags.split(", ").map((t: string) => t.trim()).filter(Boolean)
      : [];

    const filteredTags = currentTags.filter(tag => !PIPELINE_STATUSES.includes(tag));
    const newStatuses = Array.from(statusSet);

    const existingPipelineTags = currentTags.filter(t => PIPELINE_STATUSES.includes(t)).sort().join(",");
    const incomingPipelineTags = [...newStatuses].sort().join(",");

    if (existingPipelineTags === incomingPipelineTags) {
      results.skipped++;
      continue;
    }

    const newTags = [...filteredTags, ...newStatuses].join(", ");

    if (!dryRun) {
      try {
        await shopifyPut(`/orders/${shopifyOrder.id}.json`, {
          order: { id: shopifyOrder.id, tags: newTags },
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        results.errors.push(`Order ${orderNum}: ${message}`);
        continue;
      }
    }

    results.updated++;
    results.updatedOrders.push(`${orderNum} -> ${newStatuses.join(", ")}`);
  }

  return NextResponse.json({
    dryRun,
    shopifyOrdersFetched: shopifyOrders.size,
    totalPipelineOrders: orderStatuses.size,
    ...results,
  });
}
