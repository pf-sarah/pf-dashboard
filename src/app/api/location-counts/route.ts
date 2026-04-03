import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';

interface PFCount { status: string; location: string; count: number; }

const PIPELINE_STATUSES = ['bouquetReceived','checkedOn','progress','almostReadyToFrame','readyToFrame','frameCompleted','disapproved','approved','noResponse','readyToSeal','glued','readyToPackage','readyToFulfill','preparingToBeShipped'];

export interface OrderEntry { orderNum: string; variantTitle: string | null; staffName: string | null; enteredAt: string | null; }

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const pfCounts = await pfGet<PFCount[]>('/OrderProducts/CountsByLocation');
    const utah: Record<string,number> = {}, georgia: Record<string,number> = {}, unassigned: Record<string,number> = {};
    pfCounts.forEach(row => {
      if (!PIPELINE_STATUSES.includes(row.status)) return;
      if (row.location === 'Utah') utah[row.status] = (utah[row.status]??0) + row.count;
      else if (row.location === 'Georgia') georgia[row.status] = (georgia[row.status]??0) + row.count;
      else unassigned[row.status] = (unassigned[row.status]??0) + row.count;
    });

    const { data: cacheRows } = await supabase.from('order_location_cache').select('order_num, location');
    const numToLocation: Record<string,string> = {};
    cacheRows?.forEach(r => { numToLocation[r.order_num] = r.location; });

    const resolvedNums = Object.keys(numToLocation);
    const resolvedUtah: Record<string,number> = {}, resolvedGeorgia: Record<string,number> = {};
    if (resolvedNums.length > 0) {
      const { data: histRows } = await supabase.from('order_status_history').select('order_num, status').in('order_num', resolvedNums);
      const orderStatuses: Record<string,Set<string>> = {};
      histRows?.forEach(r => { if (!orderStatuses[r.order_num]) orderStatuses[r.order_num] = new Set(); orderStatuses[r.order_num].add(r.status); });
      Object.entries(orderStatuses).forEach(([num, statuses]) => {
        const loc = numToLocation[num]; if (!loc) return;
        statuses.forEach(status => {
          if (!PIPELINE_STATUSES.includes(status)) return;
          if (loc === 'Utah') resolvedUtah[status] = (resolvedUtah[status]??0) + 1;
          else if (loc === 'Georgia') resolvedGeorgia[status] = (resolvedGeorgia[status]??0) + 1;
        });
      });
    }

    const finalUtah: Record<string,number> = {}, finalGeorgia: Record<string,number> = {};
    PIPELINE_STATUSES.forEach(s => { finalUtah[s] = (utah[s]??0)+(resolvedUtah[s]??0); finalGeorgia[s] = (georgia[s]??0)+(resolvedGeorgia[s]??0); });

    const { data: allRows } = await supabase.from('order_status_history').select('order_num, variant_title, status, location, staff_name, entered_at').in('status', PIPELINE_STATUSES);
    const utahOrders: Record<string,OrderEntry[]> = {}, georgiaOrders: Record<string,OrderEntry[]> = {};
    PIPELINE_STATUSES.forEach(s => { utahOrders[s] = []; georgiaOrders[s] = []; });
    (allRows ?? []).forEach(r => {
      if (!PIPELINE_STATUSES.includes(r.status)) return;
      const rowLoc = (r.location && r.location.trim() !== '') ? r.location : null;
      const loc = rowLoc ?? numToLocation[r.order_num] ?? null;
      if (!loc) return;
      const entry: OrderEntry = { orderNum: r.order_num, variantTitle: r.variant_title, staffName: r.staff_name, enteredAt: r.entered_at };
      if (loc === 'Utah') utahOrders[r.status].push(entry);
      else if (loc === 'Georgia') georgiaOrders[r.status].push(entry);
    });
    const fifo = (a: OrderEntry, b: OrderEntry) => { if (!a.enteredAt && !b.enteredAt) return 0; if (!a.enteredAt) return 1; if (!b.enteredAt) return -1; return a.enteredAt.localeCompare(b.enteredAt); };
    PIPELINE_STATUSES.forEach(s => { utahOrders[s].sort(fifo); georgiaOrders[s].sort(fifo); });

    return NextResponse.json({ Utah: finalUtah, Georgia: finalGeorgia, UtahOrders: utahOrders, GeorgiaOrders: georgiaOrders, unresolved: Object.values(unassigned).reduce((a,b)=>a+b,0), cachedCount: cacheRows?.length??0 });
  } catch(e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
