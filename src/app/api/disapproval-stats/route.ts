import { NextRequest, NextResponse } from 'next/server';
import { auth }                      from '@clerk/nextjs/server';
import { supabase }                  from '@/lib/supabase';

// ── Week helpers (Monday-anchored, matches HistoricalsSection) ────────────────
function getMondayOfWeek(date: Date): Date {
  const d   = new Date(date);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function isoDate(d: Date): string { return d.toISOString().split('T')[0]; }

function getMonthKey(weekOf: string): string {
  // e.g. "2026-03-30" → "2026-03"
  return weekOf.slice(0, 7);
}

// All Monday-anchored weeks from a start date to today
function getAllWeeksSince(startIso: string): string[] {
  const start     = getMondayOfWeek(new Date(startIso + 'T12:00:00Z'));
  const thisMonday = getMondayOfWeek(new Date());
  const weeks: string[] = [];
  const cur = new Date(start);
  while (cur <= thisMonday) {
    weeks.push(isoDate(cur));
    cur.setUTCDate(cur.getUTCDate() + 7);
  }
  return weeks;
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface EventRow {
  designer_name: string;
  event_type:    'approved' | 'disapproved';
  week_of:       string;
  comment:       string | null;
  location:      string | null;
}

interface WeekStats {
  approvals:        number;
  disapprovals:     number;
  disapprovalRate:  number | null; // disapprovals / approvals, null if no approvals yet
  comments:         string[];
}

interface MonthStats {
  approvals:       number;
  disapprovals:    number;
  disapprovalRate: number | null;
  comments:        string[];
}

interface DesignerStats {
  weekly:  Record<string, WeekStats>;
  monthly: Record<string, MonthStats>;
  // YTD totals
  ytdApprovals:      number;
  ytdDisapprovals:   number;
  ytdDisapprovalRate: number | null;
  allComments:       string[];
  location:          string | null;
  isActive:          boolean;
}

// ── GET /api/disapproval-stats ────────────────────────────────────────────────
// Query params:
//   location = Utah | Georgia | all (default: all)
//   weeks    = number of weeks back (default: 52 for full YTD)
//
// Returns:
//   {
//     designers: Record<designerName, DesignerStats>,
//     weeks:     string[],   // all Monday-anchored weeks in range
//     months:    string[],   // all month keys in range ("2026-03")
//   }

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const locationParam = req.nextUrl.searchParams.get('location') ?? 'all';
  const weeksBack     = parseInt(req.nextUrl.searchParams.get('weeks') ?? '52');

  // YTD start: beginning of current year, but at least weeksBack weeks ago
  const ytdStart = new Date();
  ytdStart.setUTCFullYear(ytdStart.getUTCFullYear(), 0, 1); // Jan 1 of this year
  const weeksAgoDate = new Date();
  weeksAgoDate.setUTCDate(weeksAgoDate.getUTCDate() - weeksBack * 7);
  const fromDate = weeksAgoDate < ytdStart ? weeksAgoDate : ytdStart;
  const fromIso  = isoDate(getMondayOfWeek(fromDate));

  try {
    // Fetch all events in range
    // Load designer → location map from rippling_employees (source of truth)
    const { data: empData } = await supabase
      .from('rippling_employees')
      .select('full_name, location, department');

    const designerLocationMap: Record<string, string> = {};
    const activeDesigners = new Set<string>();
    for (const emp of empData ?? []) {
      designerLocationMap[emp.full_name] = emp.location;
      activeDesigners.add(emp.full_name);
    }

    // We don't filter by location in the DB because location is often null.
    // Instead we use rippling_employees to determine location per designer.
    const query = supabase
      .from('designer_approval_events')
      .select('designer_name, event_type, week_of, comment, location')
      .gte('week_of', fromIso)
      .order('week_of', { ascending: true });

    const { data, error } = await query;
    if (error) throw error;

    const rows = (data ?? []) as EventRow[];

    // Build week and month lists
    const allWeeks  = getAllWeeksSince(fromIso);
    const allMonths = [...new Set(allWeeks.map(getMonthKey))];

    // Name normalization — PF API names → Rippling/roster names
    const PF_NAME_MAP: Record<string, string> = {
      'Chloe Leonard':  'Chloe Jensen',
      'Mia Legas':      'Mia Legas Boots',
      'Kathryn Hill':   'Kathryn Sonntag',
    };

    // Aggregate per designer
    const designers: Record<string, DesignerStats> = {};

    for (const row of rows) {
      // Normalize PF API name to roster name before location lookup
      const name = PF_NAME_MAP[row.designer_name] ?? row.designer_name;
      // Resolve location from rippling (authoritative) or fall back to row location
      const resolvedLocation = designerLocationMap[name] ?? row.location ?? null;

      // Skip if location filter is set and doesn't match
      if (locationParam !== 'all' && resolvedLocation !== locationParam) continue;

      if (!designers[name]) {
        designers[name] = {
          weekly:             {},
          monthly:            {},
          ytdApprovals:       0,
          ytdDisapprovals:    0,
          ytdDisapprovalRate: null,
          allComments:        [],
          location:           resolvedLocation,
          isActive:           activeDesigners.has(name),
        };
      }

      const d   = designers[name];
      const wk  = row.week_of;
      const mon = getMonthKey(wk);

      // Weekly
      if (!d.weekly[wk]) d.weekly[wk] = { approvals: 0, disapprovals: 0, disapprovalRate: null, comments: [] };
      // Monthly
      if (!d.monthly[mon]) d.monthly[mon] = { approvals: 0, disapprovals: 0, disapprovalRate: null, comments: [] };

      if (row.event_type === 'approved') {
        d.weekly[wk].approvals++;
        d.monthly[mon].approvals++;
        d.ytdApprovals++;
      } else {
        d.weekly[wk].disapprovals++;
        d.monthly[mon].disapprovals++;
        d.ytdDisapprovals++;
        if (row.comment) {
          d.weekly[wk].comments.push(row.comment);
          d.monthly[mon].comments.push(row.comment);
          d.allComments.push(row.comment);
        }
      }
    }

    // Compute rates
    for (const d of Object.values(designers)) {
      // Weekly rates
      for (const wk of Object.values(d.weekly)) {
        wk.disapprovalRate = wk.approvals > 0
          ? wk.disapprovals / wk.approvals
          : null;
      }
      // Monthly rates
      for (const mon of Object.values(d.monthly)) {
        mon.disapprovalRate = mon.approvals > 0
          ? mon.disapprovals / mon.approvals
          : null;
      }
      // YTD rate
      d.ytdDisapprovalRate = d.ytdApprovals > 0
        ? d.ytdDisapprovals / d.ytdApprovals
        : null;
    }

    return NextResponse.json({
      designers,
      weeks:  allWeeks,
      months: allMonths,
    });

  } catch (e) {
    console.error('disapproval-stats error:', e);
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
