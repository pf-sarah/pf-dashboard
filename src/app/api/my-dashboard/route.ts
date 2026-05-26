import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

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
    .select("week_of, actual_hours, actual_orders")
    .eq("location", location)
    .eq("department", department)
    .eq("member_name", memberName)
    .gte("week_of", sinceIso)
    .order("week_of", { ascending: false });

  const rows = actuals ?? [];
  const thisWeekOf  = getMondayOfWeek(0);
  const thisWeekRow = rows.find(r => r.week_of === thisWeekOf);

  const ratioData   = rows.filter(r => r.actual_hours > 0 && r.actual_orders > 0);
  const totalHours  = ratioData.reduce((s, r) => s + (r.actual_hours ?? 0), 0);
  const totalOrders = ratioData.reduce((s, r) => s + (r.actual_orders ?? 0), 0);
  const targetRatio = totalHours > 0 && totalOrders > 0
    ? Math.round((totalHours / totalOrders) * 100) / 100
    : null;

  const historicals = rows.slice(0, 12).map(r => ({
    weekOf:  r.week_of,
    hours:   r.actual_hours,
    orders:  r.actual_orders,
    ratio:   r.actual_hours > 0 && r.actual_orders > 0
      ? Math.round((r.actual_hours / r.actual_orders) * 100) / 100
      : null,
  }));

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
      scheduledHours: null,
      ordersAssigned: thisWeekRow?.actual_orders ?? null,
      actualHours:    thisWeekRow?.actual_hours  ?? null,
      targetRatio,
    },
    historicals,
    upcomingWeeks,
    avgHours:  ratioData.length > 0 ? Math.round((totalHours  / ratioData.length) * 10) / 10 : null,
    avgOrders: ratioData.length > 0 ? Math.round((totalOrders / ratioData.length) * 10) / 10 : null,
  });
}
