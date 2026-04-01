import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGetAll, pfGet, fmtDate } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

export const maxDuration = 300;

interface WeeklyReportItem {
  orderNumber?:        string | number;
  shopifyOrderNumber?: string | number;
  variantTitle?:       string;
  status?:             string;
  location?:           string;
  uuid?:               string;
}

interface DetailsUpload {
  uploadType:               string;
  uploadedByUserFirstName?: string | null;
  uploadedByUserLastName?:  string | null;
}

interface Details {
  orderProductUploads?: DetailsUpload[];
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ── Step 1: Load staff → location map ─────────────────────────────────────
    const { data: staffRows } = await supabase.from('staff_locations').select('name, location');
    const staffLocationMap: Record<string, string> = {};
    staffRows?.forEach(r => { staffLocationMap[r.name] = r.location; });

    // ── Step 2: Load already-resolved order_product_keys ─────────────────────
    const { data: cached } = await supabase.from('order_location_cache').select('order_product_key');
    const alreadyResolved = new Set((cached ?? []).map(r => r.order_product_key));

    // ── Step 3: Scan WeeklyReport for unassigned orders (no location) ─────────
    const today = new Date();
    const paths: string[] = [];
    for (let m = 0; m < 18; m++) {
      const first = new Date(today.getFullYear(), today.getMonth() - m, 1);
      const last  = m === 0 ? today : new Date(today.getFullYear(), today.getMonth() - m + 1, 0);
      paths.push(`/OrderProducts/WeeklyReport?startDate=${fmtDate(first)}&endDate=${fmtDate(last)}`);
    }

    // uuid → { orderNum, variantTitle, key }
    const toResolve = new Map<string, { orderNum: string; variantTitle: string; key: string }>();

    for (let i = 0; i < paths.length; i += 6) {
      const results = await pfGetAll<WeeklyReportItem[]>(paths.slice(i, i + 6));
      results.forEach(items => {
        if (!items) return;
        items.forEach(item => {
          if (!item.uuid || item.location) return; // skip if already has location
          const num = String(item.orderNumber ?? item.shopifyOrderNumber ?? '');
          if (!num) return;
          const key = `${num}|${item.variantTitle ?? ''}`;
          if (alreadyResolved.has(key)) return; // already in cache
          if (!toResolve.has(item.uuid)) {
            toResolve.set(item.uuid, { orderNum: num, variantTitle: item.variantTitle ?? '', key });
          }
        });
      });
    }

    if (!toResolve.size) {
      return NextResponse.json({ resolved: 0, message: 'No new unassigned orders to resolve' });
    }

    // ── Step 4: Fetch Details for each unassigned order to get uploader ───────
    const allEntries = [...toResolve.entries()];
    const BATCH = 30;
    const rows: { order_product_key: string; order_num: string; location: string }[] = [];

    for (let i = 0; i < allEntries.length; i += BATCH) {
      const batch = allEntries.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(([uuid]) =>
          pfGet<Details>(`/OrderProducts/Details/${uuid}`).catch(() => null)
        )
      );
      results.forEach((d, j) => {
        if (!d) return;
        const [, { orderNum, variantTitle, key }] = batch[j];

        // Find bouquet uploader
        const upload = d.orderProductUploads?.find(u => u.uploadType === 'bouquet');
        const uploaderName = upload
          ? [upload.uploadedByUserFirstName, upload.uploadedByUserLastName].filter(Boolean).join(' ').trim()
          : '';

        const location = staffLocationMap[uploaderName] ?? '';
        if (!location) return; // can't determine — skip

        rows.push({ order_product_key: key, order_num: orderNum, location });
      });
    }

    if (!rows.length) {
      return NextResponse.json({ resolved: 0, message: 'No unassigned orders could be matched to a location' });
    }

    // ── Step 5: Upsert to cache ───────────────────────────────────────────────
    const { error } = await supabase
      .from('order_location_cache')
      .upsert(rows, { onConflict: 'order_product_key', ignoreDuplicates: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ resolved: rows.length, total: toResolve.size });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
