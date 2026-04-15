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

async function shopifyFetch(path: string, options: RequestInit = {}) {
  const res = await fetch(`${SHOPIFY_API}${path}`, {
    ...options,
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
      ...(options.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify ${path} -> ${res.status}: ${text}`);
  }
  return res.json();
}

async function fetchAllShopifyOrders(): Promise<Map<string, ShopifyOrder>> {
  // Fetch all Shopify orders in bulk pages of 250
  // Returns a map of order number (e.g. "43904") -> ShopifyOrder
  const orderMap = new Map<string, ShopifyOrder>();
  let url = `/orders.json?status=any&fields=id,name,tags&limit=250`;

  while (url) {
    const res = await fetch(`${SHOPIFY_API}${url}`, {
      headers: {
        "X-Shopify-Access-Token": SHOPIFY_TOKEN,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) throw new Error(`Shopify bulk fetch failed: ${res.status}`);

    const data = await res.json();
    const orders: ShopifyOrder[] = data.orders ?? [];

    for (const order of orders) {
      // order.name is like "#43904" — strip the #
      const num = order.name.replace(/^#/, "");
      orderMap.set(num, order);
    }

    // Check for next page via Link header
    const linkHeader = res.headers.get("link") ?? "";
    const nextMatch = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
    if (nextMatch) {
      // Extract just the path+query from the full URL
      const nextUrl = new URL(nextMatch[1]);
      url = nextUrl.pathname.replace(`/admin/api/2024-01`, "") + nextUrl.search;
    } else {
      url = "";
    }
  }

  return orderMap;
}

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const dryRun = searchParams.get("dryRun") === "true";

  // 1. Pull all pipeline orders from order_status_history
  const { data: cacheRows, error: dbError } = await supabase
    .from("order_status_history")
    .select("order_num, status")
    .in("status", PIPELINE_STATUSES);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Build map: orderNum -> Set of current statuses
  const orderStatuses = new Map<string, Set<string>>();
  for (const row of cacheRows ?? []) {
    if (!row.order_num || !row.status) continue;
    if (!orderStatuses.has(row.order_num)) orderStatuses.set(row.order_num, new Set());
    orderStatuses.get(row.order_num)!.add(row.status);
  }

  // 2. Fetch ALL Shopify orders in bulk (~10 API calls instead of 2,486)
  let shopifyOrders: Map<string, ShopifyOrder>;
  try {
    shopifyOrders = await fetchAllShopifyOrders();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Failed to fetch Shopify orders: ${message}` }, { status: 500 });
  }

  // 3. Loop through pipeline orders and update tags where needed
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

    // Remove all existing pipeline status tags
    const filteredTags = currentTags.filter(
      (tag) => !PIPELINE_STATUSES.includes(tag)
    );

    // Add all current statuses for this order
    const newStatuses = Array.from(statusSet);
    const tagsToWrite = [...filteredTags, ...newStatuses];

    // Skip if pipeline tags unchanged
    const existingPipelineTags = currentTags
      .filter(t => PIPELINE_STATUSES.includes(t))
      .sort()
      .join(",");
    const incomingPipelineTags = newStatuses.sort().join(",");
    if (existingPipelineTags === incomingPipelineTags) {
      results.skipped++;
      continue;
    }

    const newTags = tagsToWrite.join(", ");

    if (!dryRun) {
      try {
        await shopifyFetch(`/orders/${shopifyOrder.id}.json`, {
          method: "PUT",
          body: JSON.stringify({ order: { id: shopifyOrder.id, tags: newTags } }),
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
    totalPipelineOrders: orderStatuses.size,
    totalShopifyOrders: shopifyOrders.size,
    ...results,
  });
}
