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

const PRESERVATION_STATUSES = new Set(['bouquetReceived','checkedOn','progress','almostReadyToFrame']);
const DESIGN_STATUSES = new Set(['readyToFrame','frameCompleted','disapproved','approved','noResponse']);
const FULFILLMENT_STATUSES = new Set(['readyToSeal','glued','readyToPackage','readyToFulfill','preparingToBeShipped']);

function resolveStaff(item: SearchItem, status: string): string | null {
  let first: string | null = null;
  let last:  string | null = null;
  if (PRESERVATION_STATUSES.has(status)) { first = item.preservationUserFirstName ?? null; last = item.preservationUserLastName ?? null; }
  else if (DESIGN_STATUSES.has(status))  { first = item.assignedToUserFirstName ?? null;   last = item.assignedToUserLastName ?? null; }
  else if (FULFILLMENT_STATUSES.has(status)) { first = item.fulfillmentUserFirstName ?? null; last = item.fulfillmentUserLastName ?? null; }
  return [first, last].filter(Boolean).join(' ').trim() || null;
}

export async function runStatusSnapshot(): Promise<{ scanned: number; inserted: number; deleted: number; error?: string }> {
  const paths: string[] = [];
  const today = new Date();
  for (let m = 0; m < 18; m++) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const lastOfMonth  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`);
  }

  const seen     = new Set<string>();
  const liveKeys = new Set<string>();
  const now      = new Date().toISOString();
  const records: { order_product_key: string; order_num: string; variant_title: string | null; status: string; location: string; entered_at: string; staff_name: string | null }[] = [];
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
        const opKey = `${num}|${item.variantTitle ?? ''}`;
        liveKeys.add(`${opKey}|||${item.status}`);
        const idx = records.length;
        records.push({ order_product_key: opKey, order_num: num, variant_title: item.variantTitle ?? null, status: item.status, location: item.location ?? '', entered_at: item.orderDateUpdated ?? now, staff_name: null });
        if (!numToIndices.has(num)) numToIndices.set(num, []);
        numToIndices.get(num)!.push(idx);
      });
    });
  }

  if (!records.length) return { scanned: 0, inserted: 0, deleted: 0 };

  let deleted = 0;
  try {
    const { data: existingRows } = await supabase.from('order_status_history').select('id, order_product_key, status');
    if (existingRows?.length) {
      const staleIds = existingRows.filter(r => !liveKeys.has(`${r.order_product_key}|||${r.status}`)).map(r => r.id);
      if (staleIds.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < staleIds.length; i += BATCH) {
          await supabase.from('order_status_history').delete().in('id', staleIds.slice(i, i + BATCH));
        }
        deleted = staleIds.length;
      }
    }
  } catch { /* non-fatal */ }

  const uniqueNums = [...numToIndices.keys()];
  const SEARCH_BATCH = 50;
  for (let i = 0; i < uniqueNums.length; i += SEARCH_BATCH) {
    const batch = uniqueNums.slice(i, i + SEARCH_BATCH);
    const results = await Promise.all(batch.map(num => pfPost<SearchResponse>('/OrderProducts/Search', { searchTerm: num, pageNumber: 1, pageSize: 1 }).catch(() => null)));
    results.forEach((data, j) => {
      const item = data?.items?.[0];
      if (!item) return;
      (numToIndices.get(batch[j]) ?? []).forEach(idx => { records[idx].staff_name = resolveStaff(item, records[idx].status); });
    });
  }

  const { error: upsertError } = await supabase.from('order_status_history').upsert(records, { onConflict: 'order_product_key,status', ignoreDuplicates: true });
  if (upsertError) return { scanned: records.length, inserted: 0, deleted, error: upsertError.message };

  // Update staff_name AND location on existing rows (ignoreDuplicates: false so location gets corrected)
  const updates = records
    .filter(r => r.staff_name !== null || r.location !== '')
    .map(r => ({
      order_product_key: r.order_product_key,
      status:            r.status,
      staff_name:        r.staff_name,
      location:          r.location,
    }));

  if (updates.length) {
    await supabase
      .from('order_status_history')
      .upsert(updates, { onConflict: 'order_product_key,status', ignoreDuplicates: false });
  }

  return { scanned: records.length, inserted: records.length, deleted };
}
