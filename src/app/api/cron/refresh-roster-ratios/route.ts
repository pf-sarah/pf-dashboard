import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { supabase } from '@/lib/supabase';

// Weekly cron — recalculates every Scheduling roster member's `ratio` from
// their last 8 weeks of real actuals (team_member_week_actuals), same math
// as the per-person "↻" refresh button in SchedulePage.tsx, just run for
// everyone automatically instead of requiring someone to click it.

const ROSTER_DEPT: Record<string, string> = {
  designRoster: 'design',
  presRoster:   'preservation',
  ffRoster:     'fulfillment',
};

const LOCATIONS  = ['Utah', 'Georgia'];
const WEEKS_BACK = 8;

interface ActualRow {
  location:      string;
  department:    string;
  week_of:       string;
  member_name:   string;
  actual_hours:  number;
  actual_orders: number;
}

interface RosterMemberRow {
  name:      string;
  ratio?:    number;
  _removed?: boolean;
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Wide fetch window (matches the manual button's weeks=100) — the actual
    // "last 8 weeks" cutoff is applied per member below via slice(0, 8) on
    // their own most recent rows, not a blanket calendar cutoff, so members
    // with gaps still get their 8 most recent real weeks.
    const since = new Date();
    since.setDate(since.getDate() - 100 * 7);

    const [{ data: actuals, error: actualsErr }, { data: rosterRows, error: rosterErr }] = await Promise.all([
      supabase
        .from('team_member_week_actuals')
        .select('location,department,week_of,member_name,actual_hours,actual_orders')
        .in('location', LOCATIONS)
        .gte('week_of', since.toISOString().split('T')[0]),
      supabase
        .from('schedule_settings')
        .select('location,key,value')
        .in('key', Object.keys(ROSTER_DEPT))
        .in('location', LOCATIONS),
    ]);
    if (actualsErr) throw actualsErr;
    if (rosterErr)  throw rosterErr;

    const updated: { location: string; roster: string; name: string; from: number | null; to: number }[] = [];

    for (const row of rosterRows ?? []) {
      const dept   = ROSTER_DEPT[row.key];
      const roster = row.value as Record<string, RosterMemberRow>;
      let changed  = false;

      for (const member of Object.values(roster)) {
        if (member._removed || !member.name) continue;

        const rows = ((actuals ?? []) as ActualRow[])
          .filter(a =>
            a.location === row.location && a.department === dept &&
            a.member_name.trim().toLowerCase() === member.name.trim().toLowerCase()
          )
          .sort((a, b) => b.week_of.localeCompare(a.week_of))
          .slice(0, WEEKS_BACK);

        const totalHours  = rows.reduce((s, r) => s + r.actual_hours, 0);
        const totalOrders = rows.reduce((s, r) => s + r.actual_orders, 0);
        if (totalHours <= 0 || totalOrders <= 0) continue;

        const newRatio = Math.round((totalHours / totalOrders) * 100) / 100;
        if (newRatio !== member.ratio) {
          updated.push({ location: row.location, roster: row.key, name: member.name, from: member.ratio ?? null, to: newRatio });
          member.ratio = newRatio;
          changed = true;
        }
      }

      if (changed) {
        const { error } = await supabase
          .from('schedule_settings')
          .upsert(
            { location: row.location, key: row.key, value: roster, updated_by: 'ratio-refresh-cron', updated_at: new Date().toISOString() },
            { onConflict: 'location,key' }
          );
        if (error) throw error;
      }
    }

    return NextResponse.json({ ok: true, updated, updatedCount: updated.length });
  } catch (err) {
    console.error('[refresh-roster-ratios] Error:', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
