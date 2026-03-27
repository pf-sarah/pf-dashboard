import { pfGetAll, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

interface WeeklyReportItem {
  orderNumber?: string | number;
  shopifyOrderNumber?: string | number;
  variantTitle?: string;
  status?: string;
  location?: string;
  orderDateUpdated?: string | null;
  originalOrderDate?: string;
}

export async function runStatusSnapshot(): Promise<{ scanned: number; inserted: number; error?: string }> {
  const paths: string[] = [];
  const today = new Date();

  for (let m = 0; m < 18; m++) {
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth() - m, 1);
    const lastOfMonth  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
    paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(firstOfMonth)}&endDate=${fmtDate(lastOfMonth)}`);
  }

  const seen = new Set<string>();
  const records: {
    order_product_key: string;
    order_num: string;
    variant_title: string | null;
    status: string;
    location: string;
    entered_at: string | null;
  }[] = [];

  for (let i = 0; i < paths.length; i += 6) {
    const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 6));
    results.forEach(items => {
      if (!items) return;
      items.forEach(item => {
        if (!item.location) return;
        if (!item.status) return;
        const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
        if (!num) return;
        const key = `${num}|${item.variantTitle ?? ''}|${item.status}`;
        if (seen.has(key)) return;
        seen.add(key);
        records.push({
          order_product_key: `${num}|${item.variantTitle ?? ''}`,
          order_num: num,
          variant_title: item.variantTitle ?? null,
          status: item.status,
          location: item.location ?? '',
          entered_at: item.orderDateUpdated ?? null,
        });
      });
    });
  }

  if (!records.length) return { scanned: 0, inserted: 0 };

  const { error } = await supabase
    .from('order_status_history')
    .upsert(records, { onConflict: 'order_product_key,status', ignoreDuplicates: true });

  if (error) return { scanned: records.length, inserted: 0, error: error.message };

  return { scanned: records.length, inserted: records.length };
}
