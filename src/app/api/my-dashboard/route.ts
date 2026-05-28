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

  // Fetch scheduled hours for ALL departments (including resin) for this person
  const ALL_DEPT_KEYS = [
    { dept: 'design',       weekly: 'designHours',    daily: 'designDailyHours' },
    { dept: 'preservation', weekly: 'presHours',       daily: 'presDailyHours'   },
    { dept: 'fulfillment',  weekly: 'ffHours',         daily: 'ffDailyHours'     },
    { dept: 'resin',        weekly: 'resinHours',      daily: 'resinDailyHours'  },
  ];

  const designerId = DESIGNER_IDS[memberName] ?? null;

  // Fetch all schedule keys in one query
  const allKeys = ALL_DEPT_KEYS.flatMap(d => [d.weekly, d.daily]);
  const { data: scheduleRows } = await supabase
    .from("schedule_settings")
    .select("key, value")
    .eq("location", location)
    .in("key", allKeys);

  const scheduleMap: Record<string, Record<string, number[]>> = {};
  for (const row of scheduleRows ?? []) {
    try {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      scheduleMap[row.key] = parsed;
    } catch { /* ignore */ }
  }

  // Home dept config
  const homeDeptNorm = department?.toLowerCase() ?? '';
  const homeDeptConfig = ALL_DEPT_KEYS.find(d => d.dept === homeDeptNorm) ?? ALL_DEPT_KEYS[0];

  const homeWeeklyHours: number[] = designerId
    ? (scheduleMap[homeDeptConfig.weekly]?.[designerId] ?? []) : [];
  const dailyHours: number[] = designerId
    ? (scheduleMap[homeDeptConfig.daily]?.[designerId] ?? []).slice(0, 5) : [];

  // Cross-dept hours — look up by name across each dept's roster, not by home designerId
  // Each dept roster is stored under e.g. presRoster, ffRoster, designRoster, resinRoster
  const ROSTER_KEYS: Record<string, string> = {
    design:       'designRoster',
    preservation: 'presRoster',
    fulfillment:  'ffRoster',
    resin:        'resinRoster',
  };

  // Fetch all roster keys too
  const rosterKeyList = Object.values(ROSTER_KEYS);
  const { data: rosterRows } = await supabase
    .from("schedule_settings")
    .select("key, value")
    .eq("location", location)
    .in("key", rosterKeyList);

  const rosterMap: Record<string, Record<string, { name?: string }>> = {};
  for (const row of rosterRows ?? []) {
    try {
      const parsed = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
      rosterMap[row.key] = parsed;
    } catch { /* ignore */ }
  }

  // Helper: find a person's ID in a given dept roster by name match
  function findIdInRoster(rosterKey: string, name: string): string | null {
    const roster = rosterMap[rosterKey] ?? {};
    const nameLower = name.trim().toLowerCase();
    for (const [id, member] of Object.entries(roster)) {
      if (member?.name?.trim().toLowerCase() === nameLower) return id;
    }
    return null;
  }

  const crossDeptWeekly: { dept: string; hours: number[] }[] = [];
  for (const dk of ALL_DEPT_KEYS) {
    if (dk.dept === homeDeptNorm) continue;
    // Find this person's ID in the cross-dept roster by name
    const crossId = findIdInRoster(ROSTER_KEYS[dk.dept] ?? '', memberName);
    if (!crossId) continue;

    const deptWeekly: number[] = scheduleMap[dk.weekly]?.[crossId] ?? [];
    const deptDaily: number[]  = scheduleMap[dk.daily]?.[crossId]  ?? [];
    const dailyThisWeekTotal = deptDaily.reduce((s, h) => s + (h ?? 0), 0);

    const mergedForDept = [...deptWeekly];
    if (dailyThisWeekTotal > 0 && (mergedForDept[0] ?? 0) === 0) {
      mergedForDept[0] = Math.round(dailyThisWeekTotal * 10) / 10;
    }
    if (mergedForDept.some(h => h > 0)) {
      crossDeptWeekly.push({ dept: dk.dept, hours: mergedForDept });
    }
  }

  // Merged weekly totals (home + all cross-dept)
  const NUM_WEEKS = 8;
  const mergedWeeklyHours = Array.from({ length: NUM_WEEKS }, (_, i) => {
    const home  = homeWeeklyHours[i] ?? 0;
    const cross = crossDeptWeekly.reduce((s, d) => s + (d.hours[i] ?? 0), 0);
    const total = home + cross;
    return total > 0 ? Math.round(total * 10) / 10 : null;
  });

  // Also store daily breakdown for each cross-dept (for the weekly grid)
  const crossDeptDaily: { dept: string; daily: number[] }[] = [];
  for (const dk of ALL_DEPT_KEYS) {
    if (dk.dept === homeDeptNorm) continue;
    const crossId = findIdInRoster(ROSTER_KEYS[dk.dept] ?? '', memberName);
    if (!crossId) continue;
    const deptDaily: number[] = scheduleMap[dk.daily]?.[crossId] ?? [];
    if (deptDaily.some(h => h > 0)) {
      crossDeptDaily.push({ dept: dk.dept, daily: deptDaily.slice(0, 5) });
    }
  }

  const thisWeekCrossDeptHours = crossDeptWeekly
    .filter(d => (d.hours[0] ?? 0) > 0)
    .map(d => ({ dept: d.dept, hours: d.hours[0] }));

  const upcomingWeeks = Array.from({ length: NUM_WEEKS }, (_, i) => ({
    weekOf: getMondayOfWeek(i),
    scheduledHours: mergedWeeklyHours[i] ?? null,
    crossDept: crossDeptWeekly
      .filter(d => (d.hours[i] ?? 0) > 0)
      .map(d => ({ dept: d.dept, hours: d.hours[i] })),
  }));

  const thisWeekScheduledHours = mergedWeeklyHours[0] ?? null;

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
      crossDeptHours: thisWeekCrossDeptHours,
      crossDeptDaily,
    },
    historicals,
    upcomingWeeks,
    avgHours:  ratioData.length > 0 ? Math.round((totalHours  / ratioData.length) * 10) / 10 : null,
    avgOrders: ratioData.length > 0 ? Math.round((totalOrders / ratioData.length) * 10) / 10 : null,
    homeDepartment: department,
  });
}
