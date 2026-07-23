import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { pfGet, pfPost } from '@/lib/pf-api';
import { supabase } from '@/lib/supabase';
import { loadStaffLocationMap, resolveOrderLocation, type LocationDetails } from '@/lib/orderLocation';

export const maxDuration = 120;

interface SearchResponse {
  items: { uuid?: string }[];
}

interface DetailsHistory {
  status: string;
  dateCreated: string;
}

interface Details extends LocationDetails {
  history?: DetailsHistory[];
}

// GET /api/preservation-received?start=YYYY-MM-DD&end=YYYY-MM-DD&location=Utah
// Returns { byDate: { isoDate: count } } — the number of bouquets that entered
// "bouquetReceived" status on each day, so the Preservation check schedule can
// be driven by real intake instead of a manually-typed daily count.
export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const start    = req.nextUrl.searchParams.get('start');
  const end      = req.nextUrl.searchParams.get('end');
  const location = req.nextUrl.searchParams.get('location') ?? 'Utah';
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  // Supabase first_seen_at is when our snapshot ran (UTC), not when the status
  // changed, so we buffer the candidate window and verify the exact date from
  // the PF history array below (same pattern as /api/production-counts).
  const BUFFER_MS = 7 * 24 * 60 * 60 * 1000;
  const startISO = new Date(new Date(`${start}T00:00:00-06:00`).getTime() - BUFFER_MS).toISOString();
  const endISO   = new Date(new Date(`${end}T23:59:59-06:00`).getTime() + BUFFER_MS).toISOString();

  try {
    // Don't filter by order_status_history.location here — it's only reliably
    // populated for GA-tagged orders, so most Utah rows sit blank until someone
    // runs the Resolve Locations admin job. We resolve location live below instead.
    const { data, error } = await supabase
      .from('order_status_history')
      .select('order_num')
      .eq('status', 'bouquetReceived')
      .gte('first_seen_at', startISO)
      .lte('first_seen_at', endISO);
    if (error) throw error;

    const orderNums = [...new Set((data ?? []).map(r => r.order_num as string))];
    if (!orderNums.length) return NextResponse.json({ byDate: {} });

    const staffLocationMap = await loadStaffLocationMap();
    const BATCH = 20;
    const byDate: Record<string, number> = {};

    for (let i = 0; i < orderNums.length; i += BATCH) {
      const batch = orderNums.slice(i, i + BATCH);

      const searches = await Promise.all(
        batch.map(num =>
          pfPost<SearchResponse>('/OrderProducts/Search', {
            searchTerm: num, pageNumber: 1, pageSize: 5,
          }).catch(() => null)
        )
      );

      const detailsList = await Promise.all(
        searches.map(s =>
          Promise.all(
            (s?.items ?? []).map(item =>
              item.uuid
                ? pfGet<Details>(`/OrderProducts/Details/${item.uuid}`).catch(() => null)
                : Promise.resolve(null)
            )
          )
        )
      );

      detailsList.forEach(list => {
        list.forEach(d => {
          if (!d) return;
          if (location !== 'All' && resolveOrderLocation(d, staffLocationMap) !== location) return;
          const rawDate = d.history?.find(h => h.status === 'bouquetReceived')?.dateCreated;
          if (!rawDate) return;
          // Convert UTC timestamp to Mountain Time calendar date, same as production-counts
          const exactDate = new Date(rawDate).toLocaleDateString('en-CA', { timeZone: 'America/Denver' });
          if (exactDate < start || exactDate > end) return;
          byDate[exactDate] = (byDate[exactDate] ?? 0) + 1;
        });
      });
    }

    return NextResponse.json({ byDate });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
