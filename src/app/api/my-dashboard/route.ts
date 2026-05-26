import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getMondayOfWeek(offset = 0): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - (day === 0 ? 6 : day - 1) + offset * 7;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Get profile
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!profile || profile.role !== "user") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const memberName = profile.team_member_name;
  const location   = profile.location;
  const department = profile.department;

  if (!memberName || !location || !department) {
    return NextResponse.json({ thisWeek: null, historicals: [], upcomingWeeks: [] });
  }

  // Get actuals for last 26 weeks
  const since = new Date();
  since.setDate(since.getDate() - 26 * 7);
  const sinceIso = since.toISOString().split("T")[0];

  const { data: actuals } = await supabase
    .from("team_member_week_actuals")
    .select("week_of, actual_hours, actual_orders")
    .eq("location", location)
    .eq("department", department)
    .eq("member_name", memberName)
    .gte("week_of", sinceIso)
    .order("week_of", { ascending: false });

  const rows = actuals ?? [];

  // This week
  const thisWeekOf = getMondayOfWeek(0);
  const thisWeekRow = rows.find(r => r.week_of === thisWeekOf);

  // Get scheduled hours from schedule_settings for this week
  const { data: settings } = await supabase
    .from("schedule_settings")
    .select("value")
    .eq("location", location)
    .eq("key", "designHours")
    .single();

  // Try to find scheduled hours for this member this week
  let scheduledHours: number | null = null;
  let targetRatio: number | null = null;

  if (settings?.value) {
    try {
      const parsed = typeof settings.value === "string"
        ? JSON.parse(settings.value)
        : settings.value;
      // designHours is an array of weekly schedules keyed by designer id
      // We look for the member by name match
      if (Array.isArray(parsed)) {
        // find week index for thisWeekOf
        const today = new Date();
        const weekIdx = Math.floor((today.getTime() - new Date("2026-01-05").getTime()) / (7 * 24 * 60 * 60 * 1000));
        const clampedIdx = Math.max(0, Math.min(weekIdx, parsed.length - 1));
        scheduledHours = parsed[clampedIdx] ?? null;
      }
    } catch { /* ignore */ }
  }

  // Get ratio from team member roster
  const { data: ratioRows } = await supabase
    .from("team_member_week_actuals")
    .select("actual_hours, actual_orders")
    .eq("location", location)
    .eq("department", department)
    .eq("member_name", memberName)
    .gte("week_of", sinceIso)
    .not("actual_hours", "is", null)
    .not("actual_orders", "is", null);

  const ratioData = ratioRows ?? [];
  const totalHours  = ratioData.reduce((s, r) => s + (r.actual_hours ?? 0), 0);
  const totalOrders = ratioData.reduce((s, r) => s + (r.actual_orders ?? 0), 0);
  targetRatio = totalHours > 0 && totalOrders > 0
    ? Math.round((totalHours / totalOrders) * 100) / 100
    : null;

  // Build historicals (last 12 weeks with data)
  const historicals = rows.slice(0, 12).map(r => ({
    weekOf:  r.week_of,
    hours:   r.actual_hours,
    orders:  r.actual_orders,
    ratio:   r.actual_hours > 0 && r.actual_orders > 0
      ? Math.round((r.actual_hours / r.actual_orders) * 100) / 100
      : null,
  }));

  // Build upcoming 8 weeks
  const upcomingWeeks = Array.from({ length: 8 }, (_, i) => ({
    weekOf: getMondayOfWeek(i),
    scheduledHours: null as number | null,
  }));

  return NextResponse.json({
    memberName,
    location,
    department,
    thisWeek: {
      weekOf:         thisWeekOf,
      scheduledHours,
      ordersAssigned: thisWeekRow?.actual_orders ?? null,
      actualHours:    thisWeekRow?.actual_hours ?? null,
      targetRatio,
    },
    historicals,
    upcomingWeeks,
    avgHours:  totalHours  > 0 ? Math.round((totalHours  / Math.max(ratioData.length, 1)) * 10) / 10 : null,
    avgOrders: totalOrders > 0 ? Math.round((totalOrders / Math.max(ratioData.length, 1)) * 10) / 10 : null,
  });
}
