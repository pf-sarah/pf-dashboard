import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

interface PFCount {
  status: string;
  location: string;
  count: number;
}

const PIPELINE_STATUSES = [
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved', 'noResponse',
  'readyToSeal', 'glued', 'readyToPackage', 'readyToFulfill', 'preparingToBeShipped',
];

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    // ── Step 1: Get raw counts from PF API ────────────────────────────────────
    const pfCounts = await pfGet<PFCount[]>('/OrderProducts/CountsByLocation');

    // Build per-status totals for Utah, Georgia, and Unassigned
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

    // ── Step 2: Load resolved locations from cache ────────────────────────────
    // The cache tells us which "unassigned" order products actually belong to Utah or Georgia
    const { data: cacheRows } = await supabase
      .from('order_location_cache')
      .select('order_num, location');

    // Count resolved orders per location per status using order_status_history
    // We need to know what status each cached order is currently in
    const resolvedNums = [...new Set((cacheRows ?? []).map(r => r.order_num))];
    const numToLocation: Record<string, string> = {};
    cacheRows?.forEach(r => { numToLocation[r.order_num] = r.location; });

    // Get current status for resolved orders from order_status_history
    // We find the most recent status for each order num
    let resolvedUtah:    Record<string, number> = {};
    let resolvedGeorgia: Record<string, number> = {};

    if (resolvedNums.length > 0) {
      const { data: historyRows } = await supabase
        .from('order_status_history')
        .select('order_num, status')
        .in('order_num', resolvedNums);

      // For each order num, find its current status (most recent entry)
      const orderStatuses: Record<string, Set<string>> = {};
      historyRows?.forEach(r => {
        if (!orderStatuses[r.order_num]) orderStatuses[r.order_num] = new Set();
        orderStatuses[r.order_num].add(r.status);
      });

      // Count per status per resolved location
      Object.entries(orderStatuses).forEach(([num, statuses]) => {
        const loc = numToLocation[num];
        if (!loc) return;
        statuses.forEach(status => {
          if (!PIPELINE_STATUSES.includes(status)) return;
          if (loc === 'Utah') {
            resolvedUtah[status] = (resolvedUtah[status] ?? 0) + 1;
          } else if (loc === 'Georgia') {
            resolvedGeorgia[status] = (resolvedGeorgia[status] ?? 0) + 1;
          }
        });
      });
    }

    // ── Step 3: Build final sorted counts ────────────────────────────────────
    // Utah = PF Utah + resolved-to-Utah from unassigned
    // Georgia = PF Georgia + resolved-to-Georgia from unassigned
    const finalUtah:    Record<string, number> = {};
    const finalGeorgia: Record<string, number> = {};

    PIPELINE_STATUSES.forEach(status => {
      finalUtah[status]    = (utah[status] ?? 0)    + (resolvedUtah[status] ?? 0);
      finalGeorgia[status] = (georgia[status] ?? 0) + (resolvedGeorgia[status] ?? 0);
    });

    return NextResponse.json({
      Utah:    finalUtah,
      Georgia: finalGeorgia,
      unresolved: Object.values(unassigned).reduce((a, b) => a + b, 0),
      cachedCount: cacheRows?.length ?? 0,
    });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
