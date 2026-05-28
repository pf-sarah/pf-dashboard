import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { DESIGNER_IDS } from "@/lib/teamMembers";

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

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Allow passing explicit params for impersonation
  const memberNameParam = req.nextUrl.searchParams.get("memberName");
  const locationParam   = req.nextUrl.searchParams.get("location");
  const departmentParam = req.nextUrl.searchParams.get("department");

  let memberName: string;
  let location: string;
  let department: string;

  if (memberNameParam && locationParam && departmentParam) {
    // Verify caller is allowed — must be admin/GM/manager
    const { data: caller } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("clerk_user_id", userId)
      .single();

    const allowed = ["admin", "general_manager", "manager"].includes(caller?.role ?? "");
    if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    memberName = memberNameParam;
    location   = locationParam;
    department = departmentParam;
  } else {
    // Normal user flow — look up their own profile
    const { data: profile } = await supabase
      .from("user_profiles")
      .select("*")
      .eq("clerk_user_id", userId)
      .single();

    if (!profile) return NextResponse.json({ error: "No profile" }, { status: 403 });

    memberName = profile.team_member_name;
    location   = profile.location;
    department = profile.department;
  }

  if (!memberName || !location || !department) {
    return NextResponse.json({ thisWeek: null, historicals: [], upcomingWeeks: [] });
  }

  const since = new Date();
  since.setDate(since.getDate() - 26 * 7);
  const sinceIso = since.toISOString().split("T")[0];

  const { data: actuals } = await supabase
    .from("team_member_week_actuals")
    .select("week_of, actual_hours, actual_orders, department")
    .eq("location", location)
    .eq("member_name", memberName)
    .gte("week_of", sinceIso)
    .order("week_of", { ascending: false });

  const rows = actuals ?? [];
  const thisWeekOf  = getMondayOfWeek(0);

  // Averages/ratio/this week all based on home department
  const homeDeptRowsEarly = rows.filter(r => r.department?.toLowerCase() === department?.toLowerCase());
  const thisWeekRow = homeDeptRowsEarly.find(r => r.week_of === thisWeekOf);

  const ratioData   = homeDeptRowsEarly.filter(r => r.actual_hours > 0 && r.actual_orders > 0);
  const totalHours  = ratioData.reduce((s, r) => s + (r.actual_hours ?? 0), 0);
  const totalOrders = ratioData.reduce((s, r) => s + (r.actual_orders ?? 0), 0);
  const targetRatio = totalHours > 0 && totalOrders > 0
    ? Math.round((totalHours / totalOrders) * 100) / 100
    : null;

  // All rows sorted newest first, include department
  const historicals = rows.slice(0, 24).map(r => ({
    weekOf:     r.week_of,
    hours:      r.actual_hours,
    orders:     r.actual_orders,
    department: r.department,
    ratio:      r.actual_hours > 0 && r.actual_orders > 0
      ? Math.round((r.actual_hours / r.actual_orders) * 100) / 100
      : null,
  }));

  // Home dept rows only for averages + ratio baseline
  const homeDeptRows = rows.filter(r => r.department?.toLowerCase() === department?.toLowerCase());

  // Get scheduled hours from schedule_settings
  const scheduleKey      = department === 'design' ? 'designHours' :
                           department === 'preservation' ? 'presHours' : 'ffHours';
  const dailyScheduleKey = department === 'design' ? 'designDailyHours' :
                           department === 'preservation' ? 'presDailyHours' : 'ffDailyHours';

  const { data: scheduleRow } = await supabase
    .from("schedule_settings")
    .select("value")
    .eq("location", location)
    .eq("key", scheduleKey)
    .single();

  const designerId = DESIGNER_IDS[memberName] ?? null;
  let weeklyHours: number[] = [];
  let dailyHours: number[] = [];

  if (scheduleRow?.value && designerId) {
    try {
      const parsed = typeof scheduleRow.value === "string"
        ? JSON.parse(scheduleRow.value)
        : scheduleRow.value;
      weeklyHours = parsed[designerId] ?? [];
    } catch { /* ignore */ }
  }

  // Get daily hours
  const { data: dailyRow } = await supabase
    .from("schedule_settings")
    .select("value")
    .eq("location", location)
    .eq("key", dailyScheduleKey)
    .single();

  if (dailyRow?.value && designerId) {
    try {
      const parsed = typeof dailyRow.value === "string"
        ? JSON.parse(dailyRow.value)
        : dailyRow.value;
      dailyHours = parsed[designerId] ?? [];
    } catch { /* ignore */ }
  }

  const upcomingWeeks = Array.from({ length: 8 }, (_, i) => ({
    weekOf: getMondayOfWeek(i),
    scheduledHours: weeklyHours[i] ?? null,
  }));

  const thisWeekScheduledHours = weeklyHours[0] ?? null;

  return NextResponse.json({
    memberName,
    location,
    department,
    dailyHours,
    thisWeek: {
      weekOf:         thisWeekOf,
      scheduledHours: thisWeekScheduledHours,
      ordersAssigned: thisWeekRow?.actual_orders ?? null,
      actualHours:    thisWeekRow?.actual_hours  ?? null,
      targetRatio,
    },
    historicals,
    upcomingWeeks,
    avgHours:  ratioData.length > 0 ? Math.round((totalHours  / ratioData.length) * 10) / 10 : null,
    avgOrders: ratioData.length > 0 ? Math.round((totalOrders / ratioData.length) * 10) / 10 : null,
    homeDepartment: department,
  });
}
