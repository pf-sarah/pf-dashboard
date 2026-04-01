import { pfGetAll, pfPost, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

interface WeeklyReportItem {
  orderNumber?:        string | number;
  shopifyOrderNumber?: string | number;
  variantTitle?:       string;
  status?:             string;
  location?:           string;
  orderDateUpdated?:   string | null;
  originalOrderDate?:  string;
  uuid?:               string;
}

interface SearchItem {
  preservationUserFirstName?: string | null;
  preservationUserLastName?:  string | null;
  assignedToUserFirstName?:   string | null;
  assignedToUserLastName?:    string | null;
  fulfillmentUserFirstName?:  string | null;
  fulfillmentUserLastName?:   string | null;
}

interface SearchResponse {
  items: SearchItem[];
}

const PRESERVATION_STATUSES = new Set([
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
]);
const DESIGN_STATUSES = new Set([
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved', 'noResponse',
]);
const FULFILLMENT_STATUSES = new Set([
  'readyToSeal', 'glued', 'readyToPackage', 'readyToFulfill', 'preparingToBeShipped',
]);

function resolveStaff(item: SearchItem, status: string): string | null {
  let first: string | null = null;
  let last:  string | null = null;

  if (PRESERVATION_STATUSES.has(status)) {
    first = item.preservationUserFirstName ?? null;
    last  = item.preservationUserLastName  ?? null;
  } else if (DESIGN_STATUSES.has(status)) {
    first = item.assignedToUserFirstName ?? null;
    last  = item.assignedToUserLastName  ?? null;
  } else if (FULFILLMENT_STATUSES.has(status)) {
    first = item.fulfillmentUserFirstName ?? null;
    last  = item.fulfillmentUserLastName  ?? null;
  }

  const name = [first, last].filter(Boolean).join(' ').trim();
  return name || null;
}

export async function runStatusSnapshot(): Promise<{
  scanned:  number;
  inserted: number;
  error?:   string;
}> {
  // ── Step 1: Scan WeeklyReport (18 months) ──────────────────────────────────
  const paths: string[] = [];
  const today = new Date();
  for (let m = 0; m < 18; m++) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const lastOfMonth  = m === 0
      ? today
      : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    paths.push(
      `/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`
    );
  }

  const seen = new Set<string>();
  const now  = new Date().toISOString();

  const records: {
    order_product_key: string;
    order_num:         string;
    variant_title:     string | null;
    status:            string;
    location:          string;
    entered_at:        string;
    staff_name:        string | null;
  }[] = [];

  // num → indices into records (for staff fan-out after Search)
  const numToIndices = new Map<string, number[]>();

  for (let i = 0; i < paths.length; i += 6) {
    const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 6));
    results.forEach(items => {
      if (!items) return;
      items.forEach(item => {
        if (!item.status) return;
        const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
        if (!num) return;
        const key = `${num}|${item.variantTitle ?? ''}|${item.status}`;
        if (seen.has(key)) return;
        seen.add(key);

        const idx = records.length;
        records.push({
          order_product_key: `${num}|${item.variantTitle ?? ''}`,
          order_num:         num,
          variant_title:     item.variantTitle ?? null,
          status:            item.status,
          location:          item.location ?? '',
          // orderDateUpdated is unreliable — use it if present, otherwise now.
          // Accurate entered_at for production counting comes from the history
          // array in Details, which we store separately in production_events.
          entered_at:        item.orderDateUpdated ?? now,
          staff_name:        null,
        });

        if (!numToIndices.has(num)) numToIndices.set(num, []);
        numToIndices.get(num)!.push(idx);
      });
    });
  }

  if (!records.length) return { scanned: 0, inserted: 0 };

  // ── Step 2: Batch Search for staff names ───────────────────────────────────
  // One Search call per unique order number — fans out to all statuses/products.
  const uniqueNums = [...numToIndices.keys()];
  const SEARCH_BATCH = 50;

  for (let i = 0; i < uniqueNums.length; i += SEARCH_BATCH) {
    const batch = uniqueNums.slice(i, i + SEARCH_BATCH);
    const results = await Promise.all(
      batch.map(num =>
        pfPost<SearchResponse>('/OrderProducts/Search', {
          searchTerm: num,
          pageNumber: 1,
          pageSize:   1,
        }).catch(() => null)
      )
    );

    results.forEach((data, j) => {
      const item = data?.items?.[0];
      if (!item) return;
      const indices = numToIndices.get(batch[j]) ?? [];
      indices.forEach(idx => {
        records[idx].staff_name = resolveStaff(item, records[idx].status);
      });
    });
  }

  // ── Step 3: Upsert — update staff_name but preserve existing entered_at ────
  // We split into two operations:
  // 1. Insert new rows (ignoreDuplicates: true) — preserves entered_at for existing rows
  // 2. Update staff_name only on existing rows via a separate update
  const { error: upsertError } = await supabase
    .from('order_status_history')
    .upsert(records, { onConflict: 'order_product_key,status', ignoreDuplicates: true });

  if (upsertError) return { scanned: records.length, inserted: 0, error: upsertError.message };

  // Update staff_name on existing rows without touching entered_at
  const staffUpdates = records
    .filter(r => r.staff_name !== null)
    .map(r => ({
      order_product_key: r.order_product_key,
      status:            r.status,
      staff_name:        r.staff_name,
      location:          r.location,
    }));

  if (staffUpdates.length) {
    await supabase
      .from('order_status_history')
      .upsert(staffUpdates, { onConflict: 'order_product_key,status', ignoreDuplicates: false });
  }

  return { scanned: records.length, inserted: records.length };
}
