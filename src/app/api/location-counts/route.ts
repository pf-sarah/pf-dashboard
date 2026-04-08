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
    // ── Step 1: PF API counts (source of truth for numbers) ──────────────────
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

    const finalUtah:    Record<string, number> = {};
    const finalGeorgia: Record<string, number> = {};
    PIPELINE_STATUSES.forEach(s => {
      finalUtah[s]    = utah[s]    ?? 0;
      finalGeorgia[s] = georgia[s] ?? 0;
    });

    // ── Step 2: Order lists from uuid_location_cache ─────────────────────────
    // This table is pre-populated by the daily cron with all pipeline UUIDs
    const { data: cacheRows } = await supabase
      .from('uuid_location_cache')
      .select('uuid, order_num, status, location, staff_name, order_date')
      .in('status', PIPELINE_STATUSES)
      .limit(20000);

    const utahOrders:    Record<string, UuidOrderEntry[]> = {};
    const georgiaOrders: Record<string, UuidOrderEntry[]> = {};
    PIPELINE_STATUSES.forEach(s => { utahOrders[s] = []; georgiaOrders[s] = []; });

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
        utahOrders[r.status].push(entry);
      } else if (r.location === 'Georgia') {
        georgiaOrders[r.status].push(entry);
      }
    });

    // Sort FIFO oldest order_date first
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

    return NextResponse.json({
      Utah:          finalUtah,
      Georgia:       finalGeorgia,
      UtahOrders:    utahOrders,
      GeorgiaOrders: georgiaOrders,
      unresolved:    Object.values(unassigned).reduce((a, b) => a + b, 0),
      lastSynced:    cacheRows?.[0] ? 'cache populated' : 'cache empty — run sync',
    });

  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
