import { pfGetAll, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

interface WeeklyReportItem {
  orderNumber?:        string | number;
  shopifyOrderNumber?: string | number;
  variantTitle?:       string;
  status?:             string;
  location?:           string;
  orderDateUpdated?:   string | null;
  uuid?:               string;
}

export async function runStatusSnapshot(): Promise<{
  scanned: number; inserted: number; deleted: number; error?: string;
}> {
  const paths: string[] = [];
  const today = new Date();
  for (let m = 0; m < 12; m++) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const lastOfMonth  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`);
  }

  const seen           = new Set<string>();
  const liveKeys       = new Set<string>();
  const variantCounter = new Map<string, number>();
  const now            = new Date().toISOString();

  const records: {
    order_product_key: string; order_num: string; variant_title: string | null;
    status: string; location: string; entered_at: string; staff_name: string | null;
  }[] = [];

  for (let i = 0; i < paths.length; i += 6) {
    const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 6));
    results.forEach(items => {
      if (!items) return;
      items.forEach(item => {
        if (!item.status) return;
        const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
        if (!num) return;

        // Build a unique key per order product.
        // If UUID is available, use it (handles identical variants correctly).
        // Otherwise use variant+counter so duplicate variants each get their own row.
        let opKey: string;
        if (item.uuid) {
          opKey = `${num}|${item.uuid}`;
        } else {
          const cKey = `${num}|${item.variantTitle ?? ''}|${item.status}`;
          const cnt  = variantCounter.get(cKey) ?? 0;
          variantCounter.set(cKey, cnt + 1);
          opKey = cnt === 0
            ? `${num}|${item.variantTitle ?? ''}`
            : `${num}|${item.variantTitle ?? ''}|${cnt}`;
        }

        const key = `${opKey}|||${item.status}`;
        if (seen.has(key)) return;
        seen.add(key);
        liveKeys.add(key);

        records.push({
          order_product_key: opKey,
          order_num:         num,
          variant_title:     item.variantTitle ?? null,
          status:            item.status,
          location:          item.location ?? '',
          entered_at:        item.orderDateUpdated ?? now,
          staff_name:        null,
        });
      });
    });
  }

  if (!records.length) return { scanned: 0, inserted: 0, deleted: 0 };

  // Delete stale rows
  let deleted = 0;
  try {
    const { data: existingRows } = await supabase
      .from('order_status_history')
      .select('id, order_product_key, status');
    if (existingRows?.length) {
      const staleIds = existingRows
        .filter(r => !liveKeys.has(`${r.order_product_key}|||${r.status}`))
        .map(r => r.id);
      if (staleIds.length > 0) {
        const BATCH = 500;
        for (let i = 0; i < staleIds.length; i += BATCH) {
          await supabase.from('order_status_history').delete().in('id', staleIds.slice(i, i + BATCH));
        }
        deleted = staleIds.length;
      }
    }
  } catch { /* non-fatal */ }

  // Upsert new rows (preserve existing entered_at)
  const { error: upsertError } = await supabase
    .from('order_status_history')
    .upsert(records, { onConflict: 'order_product_key,status', ignoreDuplicates: true });

  if (upsertError) return { scanned: records.length, inserted: 0, deleted, error: upsertError.message };

  // Update location on existing blank rows
  const locationUpdates = records.filter(r => r.location !== '').map(r => ({
    order_product_key: r.order_product_key,
    status:            r.status,
    location:          r.location,
    staff_name:        r.staff_name,
  }));
  if (locationUpdates.length) {
    await supabase.from('order_status_history')
      .upsert(locationUpdates, { onConflict: 'order_product_key,status', ignoreDuplicates: false });
  }

  return { scanned: records.length, inserted: records.length, deleted };
}
