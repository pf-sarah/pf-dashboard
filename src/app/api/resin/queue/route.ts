import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const page     = parseInt(searchParams.get('page')     ?? '1');
  const pageSize = parseInt(searchParams.get('pageSize') ?? '100');
  const summary  = searchParams.get('summary') === 'true'; // just counts + cohort data

  const from = (page - 1) * pageSize;
  const to   = from + pageSize - 1;

  if (summary) {
    // ── Summary mode: queue counts + cohort breakdown for turnaround tab ──────
    const { data, error } = await supabase
      .from('resin_queue')
      .select('pf_status, pf_status_rank, origin_location, order_date, quantity')
      .order('pf_status_rank', { ascending: true })
      .order('order_date',     { ascending: true });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = data ?? [];
    const totalUnits     = rows.reduce((s, r) => s + (r.quantity ?? 1), 0);
    const utahOrigin     = rows.filter(r => r.origin_location === 'Utah').reduce((s, r) => s + (r.quantity ?? 1), 0);
    const georgiaOrigin  = rows.filter(r => r.origin_location === 'Georgia').reduce((s, r) => s + (r.quantity ?? 1), 0);
    const unknownOrigin  = rows.filter(r => !r.origin_location).reduce((s, r) => s + (r.quantity ?? 1), 0);

    // Group by intake week (Mon of the week of order_date) for turnaround chart
    const cohortMap = new Map<string, number>();
    for (const r of rows) {
      if (!r.order_date) continue;
      const d = new Date(r.order_date + 'T12:00:00');
      const day = d.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      d.setDate(d.getDate() + diff);
      const weekKey = d.toISOString().split('T')[0];
      cohortMap.set(weekKey, (cohortMap.get(weekKey) ?? 0) + (r.quantity ?? 1));
    }

    const cohorts = [...cohortMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekOf, units]) => ({ weekOf, units }));

    return NextResponse.json({
      totalUnits,
      utahOrigin,
      georgiaOrigin,
      unknownOrigin,
      cohorts,
    });
  }

  // ── List mode: paginated queue for the order list view ───────────────────────
  const { data, error, count } = await supabase
    .from('resin_queue')
    .select('*', { count: 'exact' })
    .order('pf_status_rank', { ascending: true })
    .order('order_date',     { ascending: true })
    .range(from, to);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    orders:   data ?? [],
    total:    count ?? 0,
    page,
    pageSize,
    hasMore:  (count ?? 0) > to + 1,
  });
}
