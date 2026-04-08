import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

interface PFCount {
  status:   string;
  location: string;
  count:    number;
}

const PIPELINE_STATUSES = [
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved', 'noResponse',
  'readyToSeal', 'glued', 'readyToPackage', 'readyToFulfill', 'preparingToBeShipped',
];

export interface UuidOrderEntry {
  uuid:      string;
  orderNum:  string;
  status:    string;
  location:  string | null;
  staffName: string | null;
  orderDate: string | null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ── Step 1: PF API counts (source of truth) ───────────────────────────────
    const pfCounts = await pfGet<PFCount[]>('/OrderProducts/CountsByLocation');

    const utah:       Record<string, number> = {};
    const georgia:    Record<string, number> = {};
    const unassigned: Record<string, number> = {};

    pfCounts.forEach(row => {
      if (!PIPELINE_STATUSES.includes(row.status)) return;
      if (row.location === 'Utah') {
        utah[row.status] = (utah[row.status] ?? 0) + row.count;
      } else if (row.location === 'Georgia') {
        georgia[row.status] = (georgia[row.status] ?? 0) + row.count;
      } else {
        unassigned[row.status] = (unassigned[row.status] ?? 0) + row.count;
      }
    });

    // ── Step 2: Cache rows — resolved + unresolved ────────────────────────────
    const { data: cacheRows } = await supabase
      .from('uuid_location_cache')
      .select('uuid, order_num, status, location, staff_name, order_date')
      .in('status', PIPELINE_STATUSES)
      .limit(20000);

    const utahOrders:    Record<string, UuidOrderEntry[]> = {};
    const georgiaOrders: Record<string, UuidOrderEntry[]> = {};
    const cacheUtah:     Record<string, number> = {};
    const cacheGeorgia:  Record<string, number> = {};

    // Track unsorted: order_num -> Set of statuses (deduplicate by order+status)
    const unsortedMap: Map<string, Set<string>> = new Map();

    PIPELINE_STATUSES.forEach(s => {
      utahOrders[s]    = [];
      georgiaOrders[s] = [];
      cacheUtah[s]     = 0;
      cacheGeorgia[s]  = 0;
    });

    (cacheRows ?? []).forEach(r => {
      const entry: UuidOrderEntry = {
        uuid:      r.uuid,
        orderNum:  r.order_num,
        status:    r.status,
        location:  r.location,
        staffName: r.staff_name,
        orderDate: r.order_date,
      };

      if (r.location === 'Utah') {
        utahOrders[r.status]?.push(entry);
        cacheUtah[r.status] = (cacheUtah[r.status] ?? 0) + 1;
      } else if (r.location === 'Georgia') {
        georgiaOrders[r.status]?.push(entry);
        cacheGeorgia[r.status] = (cacheGeorgia[r.status] ?? 0) + 1;
      } else {
        // Unresolved — track order number + status for unsorted report
        if (!unsortedMap.has(r.order_num)) unsortedMap.set(r.order_num, new Set());
        unsortedMap.get(r.order_num)!.add(r.status);
      }
    });

    // ── Step 3: Final counts = PF API + cache-resolved extras ─────────────────
    // PF API already counts its own assigned orders correctly.
    // Cache-resolved orders were unassigned in PF, so we add only the cache
    // counts for orders that PF put in "unassigned" bucket.
    // We cap the addition at the unassigned count to avoid double-counting.
    const finalUtah:    Record<string, number> = {};
    const finalGeorgia: Record<string, number> = {};

    PIPELINE_STATUSES.forEach(s => {
      const pfUnassigned = unassigned[s] ?? 0;
      const resolvedUtah    = Math.min(cacheUtah[s]    ?? 0, pfUnassigned);
      const resolvedGeorgia = Math.min(cacheGeorgia[s] ?? 0, pfUnassigned - resolvedUtah);
      finalUtah[s]    = (utah[s]    ?? 0) + resolvedUtah;
      finalGeorgia[s] = (georgia[s] ?? 0) + resolvedGeorgia;
    });

    // ── Step 4: Sort FIFO ─────────────────────────────────────────────────────
    const fifo = (a: UuidOrderEntry, b: UuidOrderEntry) => {
      if (!a.orderDate && !b.orderDate) return 0;
      if (!a.orderDate) return 1;
      if (!b.orderDate) return -1;
      return a.orderDate.localeCompare(b.orderDate);
    };
    PIPELINE_STATUSES.forEach(s => {
      utahOrders[s].sort(fifo);
      georgiaOrders[s].sort(fifo);
    });

    // ── Step 5: Build unsorted report ─────────────────────────────────────────
    const unsortedOrders = [...unsortedMap.entries()].map(([orderNum, statuses]) => ({
      orderNum,
      statuses: [...statuses],
    }));

    const pfTotal       = Object.values(utah).reduce((a, b) => a + b, 0) + Object.values(georgia).reduce((a, b) => a + b, 0) + Object.values(unassigned).reduce((a, b) => a + b, 0);
    const sortedUtah    = Object.values(finalUtah).reduce((a, b) => a + b, 0);
    const sortedGeorgia = Object.values(finalGeorgia).reduce((a, b) => a + b, 0);
    const totalUnsorted = Math.max(0, pfTotal - sortedUtah - sortedGeorgia);
    return NextResponse.json({
      Utah:          finalUtah,
      Georgia:       finalGeorgia,
      UtahOrders:    utahOrders,
      GeorgiaOrders: georgiaOrders,
      unsortedOrders,
      totalUnsorted,
      pfTotal,
      lastSynced:    cacheRows?.[0] ? 'cache populated' : 'cache empty — run sync',
    });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
