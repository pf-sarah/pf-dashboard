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
  const dryRun = searchParams.get("dryRun") === "true";

  const { data: cacheRows, error: dbError } = await supabase
    .from("order_status_history")
    .select("order_num, status, entered_at")
    .in("status", PIPELINE_STATUSES)
    .order("entered_at", { ascending: false });

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  const orderMap = new Map<string, string>();
  for (const row of cacheRows ?? []) {
    if (row.order_num && row.status && !orderMap.has(row.order_num)) {
      orderMap.set(row.order_num, row.status);
    }
  }

  const allOrders = Array.from(orderMap.entries());

  const results = {
    updated: 0,
    skipped: 0,
    errors: [] as string[],
    updatedOrders: [] as string[],
  };

  for (const [orderNum, status] of allOrders) {
    try {
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

      const filteredTags = currentTags.filter(
        (tag) => !PIPELINE_STATUSES.includes(tag)
      );

      if (currentTags.includes(status) && filteredTags.length === currentTags.length - 1) {
        results.skipped++;
        continue;
      }

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
    totalOrders: allOrders.length,
    ...results,
  });
}
