import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

const PIPELINE_STATUSES = new Set([
  'bouquetReceived', 'checkedOn', 'progress', 'almostReadyToFrame',
  'readyToFrame', 'frameCompleted', 'disapproved', 'approved', 'noResponse',
  'readyToSeal', 'glued', 'readyToPackage', 'readyToFulfill', 'preparingToBeShipped',
]);

export interface OrderEntry {
  uuid:      string;
  orderNum:  string;
  status:    string;
  location:  string;
  staffName: string | null;
  orderDate: string | null;
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const location = searchParams.get('location'); // 'Utah' | 'Georgia'
  const status   = searchParams.get('status');   // e.g. 'readyToFrame'
  const search   = searchParams.get('search');   // optional search query
  const page     = parseInt(searchParams.get('page') ?? '1', 10);
  const pageSize = parseInt(searchParams.get('pageSize') ?? '100', 10);

  // ── Global search mode ────────────────────────────────────────────────────
  // If search is provided without location/status, search across all orders
  if (search && !location && !status) {
    const q = search.trim();
    const { data } = await supabase
      .from('uuid_location_cache')
      .select('uuid, order_num, status, location, staff_name, order_date')
      .in('status', [...PIPELINE_STATUSES])
      .or(`order_num.eq.${q},staff_name.ilike.%${q}%`)
      .not('location', 'is', null)
      .order('order_date', { ascending: true })
      .limit(200);

    return NextResponse.json({
      orders: (data ?? []).map(r => ({
        uuid:      r.uuid,
        orderNum:  r.order_num,
        status:    r.status,
        location:  r.location,
        staffName: r.staff_name,
        orderDate: r.order_date,
      })),
      total: data?.length ?? 0,
    });
  }

  // ── Status drilldown mode ─────────────────────────────────────────────────
  if (!location || !status) {
    return NextResponse.json({ error: 'location and status params required' }, { status: 400 });
  }

  if (!PIPELINE_STATUSES.has(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  if (location !== 'Utah' && location !== 'Georgia') {
    return NextResponse.json({ error: 'location must be Utah or Georgia' }, { status: 400 });
  }

  const offset = (page - 1) * pageSize;

  let query = supabase
    .from('uuid_location_cache')
    .select('uuid, order_num, status, location, staff_name, order_date', { count: 'exact' })
    .eq('location', location)
    .eq('status', status)
    .order('order_date', { ascending: true })
    .range(offset, offset + pageSize - 1);

  // Optional search within the status list
  if (search) {
    const q = search.trim();
    query = supabase
      .from('uuid_location_cache')
      .select('uuid, order_num, status, location, staff_name, order_date', { count: 'exact' })
      .eq('location', location)
      .eq('status', status)
      .or(`order_num.eq.${q},staff_name.ilike.%${q}%`)
      .order('order_date', { ascending: true })
      .range(offset, offset + pageSize - 1);
  }

  const { data, count, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders: (data ?? []).map(r => ({
      uuid:      r.uuid,
      orderNum:  r.order_num,
      status:    r.status,
      location:  r.location,
      staffName: r.staff_name,
      orderDate: r.order_date,
    })),
    total:    count ?? 0,
    page,
    pageSize,
    hasMore:  offset + pageSize < (count ?? 0),
  });
}
