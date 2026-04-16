content = r"""import { NextResponse } from "next/server";
import { pfGetAll, fmtDate } from "@/lib/pf-api";

export const maxDuration = 300;

const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN!;
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_TOKEN!;
const SHOPIFY_API = `https://${SHOPIFY_DOMAIN}/admin/api/2024-01`;

const PIPELINE_STATUSES = [
  "bouquetReceived", "checkedOn", "progress", "almostReadyToFrame",
  "readyToFrame", "noResponse", "disapproved", "approved",
  "glued", "readyToSeal", "readyToPackage", "readyToFulfill",
  "preparingToBeShipped", "shipped", "waitingForResponse"
];

interface WeeklyReportItem {
  orderNumber?:        string | number;
  shopifyOrderNumber?: string | number;
  status?:             string;
  variantTitle?:       string;
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

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = new URL(req.url).searchParams;
  const dryRun = searchParams.get("dryRun") === "true";

  // Build 12 months of WeeklyReport paths (same as status-snapshot)
  const paths: string[] = [];
  const today = new Date();
  for (let m = 0; m < 12; m++) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const lastOfMonth  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    paths.push(
      `/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}&pageSize=1000`
    );
  }

  // Fetch all months in parallel batches of 6
  // Map: orderNum -> Set of statuses (an order can have multiple products at different statuses)
  const orderStatuses = new Map<string, Set<string>>();

  for (let i = 0; i < paths.length; i += 6) {
    const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 6));
    results.forEach(items => {
      if (!items) return;
      items.forEach(item => {
        if (!item.status || !PIPELINE_STATUSES.includes(item.status)) return;
        const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? "");
        if (!num) return;
        if (!orderStatuses.has(num)) orderStatuses.set(num, new Set());
        orderStatuses.get(num)!.add(item.status);
      });
    });
  }

  const allOrders = Array.from(orderStatuses.entries());

  const results = {
    updated: 0,
    skipped: 0,
    errors: [] as string[],
    updatedOrders: [] as string[],
  };

  for (const [orderNum, statusSet] of allOrders) {
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

      // Remove all existing pipeline status tags
      const filteredTags = currentTags.filter(
        (tag) => !PIPELINE_STATUSES.includes(tag)
      );

      // Add all current statuses for this order (handles multiple order products)
      const newStatuses = Array.from(statusSet);
      const tagsToWrite = [...filteredTags, ...newStatuses];

      // Skip if nothing changed
      const existingPipelineTags = currentTags.filter(t => PIPELINE_STATUSES.includes(t)).sort();
      const incomingPipelineTags = newStatuses.sort();
      if (JSON.stringify(existingPipelineTags) === JSON.stringify(incomingPipelineTags)) {
        results.skipped++;
        continue;
      }

      const newTags = tagsToWrite.join(", ");

      if (!dryRun) {
        await shopifyFetch(`/orders/${shopifyOrder.id}.json`, {
          method: "PUT",
          body: JSON.stringify({ order: { id: shopifyOrder.id, tags: newTags } }),
        });
      }

      results.updated++;
      results.updatedOrders.push(`${orderNum} -> ${newStatuses.join(", ")}`);
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
"""

with open("src/app/api/cron/sync-shopify-tags/route.ts", "w") as f:
    f.write(content)
print("Done")
