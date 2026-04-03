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

export interface OrderEntry {
  orderNum:     string;
  variantTitle: string | null;
  staffName:    string | null;
  enteredAt:    string | null;
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
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

    const [historyResult, cacheResult] = await Promise.all([
      supabase
        .from('order_status_history')
        .select('order_num, variant_title, status, location, staff_name, entered_at')
        .in('status', PIPELINE_STATUSES),
      supabase
        .from('order_location_cache')
        .select('order_num, location'),
    ]);

    const historyRows = historyResult.data ?? [];
    const cacheRows   = cacheResult.data   ?? [];

    const numToLocation: Record<string, string> = {};
    cacheRows.forEach(r => { numToLocation[r.order_num] = r.location; });

    const utahOrders:    Record<string, OrderEntry[]> = {};
    const georgiaOrders: Record<string, OrderEntry[]> = {};
    const resolvedUtahCounts:    Record<string, number> = {};
    const resolvedGeorgiaCounts: Record<string, number> = {};

    PIPELINE_STATUSES.forEach(s => {
      utahOrders[s]    = [];
      georgiaOrders[s] = [];
    });

    historyRows.forEach(r => {
      if (!PIPELINE_STATUSES.includes(r.status)) return;
      const effectiveLocation = numToLocation[r.order_num] ?? r.location;
      const isFromUnassigned  = numToLocation[r.order_num] !== undefined;
      const entry: OrderEntry = {
        orderNum:     r.order_num,
        variantTitle: r.variant_title,
        staffName:    r.staff_name,
        enteredAt:    r.entered_at,
      };
      if (effectiveLocation === 'Utah') {
        if (!utahOrders[r.status]) utahOrders[r.status] = [];
        utahOrders[r.status].push(entry);
        if (isFromUnassigned) resolvedUtahCounts[r.status] = (resolvedUtahCounts[r.status] ?? 0) + 1;
      } else if (effectiveLocation === 'Georgia') {
        if (!georgiaOrders[r.status]) georgiaOrders[r.status] = [];
        georgiaOrders[r.status].push(entry);
        if (isFromUnassigned) resolvedGeorgiaCounts[r.status] = (resolvedGeorgiaCounts[r.status] ?? 0) + 1;
      }
    });

    PIPELINE_STATUSES.forEach(s => {
      const sort = (a: OrderEntry, b: OrderEntry) => {
        if (!a.enteredAt && !b.enteredAt) return 0;
        if (!a.enteredAt) return 1;
        if (!b.enteredAt) return -1;
        return a.enteredAt.localeCompare(b.enteredAt);
      };
      utahOrders[s].sort(sort);
      georgiaOrders[s].sort(sort);
    });

    const finalUtah:    Record<string, number> = {};
    const finalGeorgia: Record<string, number> = {};
    PIPELINE_STATUSES.forEach(status => {
      finalUtah[status]    = (utah[status]    ?? 0) + (resolvedUtahCounts[status]    ?? 0);
      finalGeorgia[status] = (georgia[status] ?? 0) + (resolvedGeorgiaCounts[status] ?? 0);
    });

    return NextResponse.json({
      Utah:          finalUtah,
      Georgia:       finalGeorgia,
      UtahOrders:    utahOrders,
      GeorgiaOrders: georgiaOrders,
      unresolved:    Object.values(unassigned).reduce((a, b) => a + b, 0),
      cachedCount:   cacheRows.length,
    });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
