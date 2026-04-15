import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const SHOPIFY_API = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01`;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const PIPELINE_STATUSES = [
  "bouquetReceived", "checkedOn", "inProgress", "almostReadyToFrame",
  "readyToFrame", "frameCompleted", "glued", "readyToSeal",
  "readyToPackage", "readyToFulfill", "preparingToShip",
  "approved", "disapproved"
];

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

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const dryRun = searchParams.get("dryRun") === "true";

  // Pull pipeline orders from uuid_location_cache
  const { data: cacheRows, error: dbError } = await supabase
    .from("uuid_location_cache")
    .select("order_num, status")
    .in("status", PIPELINE_STATUSES);

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  // Dedupe to one row per order_num (use first encountered status)
  const orderMap = new Map<string, string>();
  for (const row of cacheRows ?? []) {
    if (row.order_num && row.status && !orderMap.has(row.order_num)) {
      orderMap.set(row.order_num, row.status);
    }
  }

  const allOrders = Array.from(orderMap.entries());
  const totalOrders = allOrders.length;
  const batch = allOrders.slice(offset, offset + limit);
  const nextOffset = offset + limit < totalOrders ? offset + limit : null;

  const results = {
    updated: 0,
    skipped: 0,
    errors: [] as string[],
    updatedOrders: [] as string[],
  };

  for (const [orderNum, status] of batch) {
    try {
      // Look up Shopify order by name
      const orderName = encodeURIComponent(`#${orderNum}`);
      const { orders } = await shopifyFetch(
        `/orders.json?name=${orderName}&status=any&fields=id,name,tags`
      );

      if (!orders || orders.length === 0) {
        results.skipped++;
        continue;
      }

      const shopifyOrder = orders[0];
      const currentTags: string[] = shopifyOrder.tags
        ? shopifyOrder.tags.split(", ").map((t: string) => t.trim()).filter(Boolean)
        : [];

      // Remove any existing pipeline status tags
      const filteredTags = currentTags.filter(
        (tag) => !PIPELINE_STATUSES.includes(tag)
      );

      // Check if tag already correct
      if (currentTags.includes(status) && filteredTags.length === currentTags.length - 1) {
        results.skipped++;
        continue;
      }

      // Add current status
      filteredTags.push(status);
      const newTags = filteredTags.join(", ");

      if (!dryRun) {
        await shopifyFetch(`/orders/${shopifyOrder.id}.json`, {
          method: "PUT",
          body: JSON.stringify({ order: { id: shopifyOrder.id, tags: newTags } }),
        });
      }

      results.updated++;
      results.updatedOrders.push(`${orderNum} -> ${status}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      results.errors.push(`Order ${orderNum}: ${message}`);
    }
  }

  return NextResponse.json({
    dryRun,
    totalOrders,
    offset,
    limit,
    batchSize: batch.length,
    nextOffset,
    ...results,
  });
}
