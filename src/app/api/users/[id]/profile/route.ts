import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  // Get requestor profile
  const { data: requestor } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (!requestor) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: targetId } = await params;

  // Get target profile
  const { data: target } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("clerk_user_id", targetId)
    .single();

  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Check permission to impersonate
  const isAdmin = requestor.role === "admin";
  const isGM = requestor.role === "general_manager";
  const isManager = requestor.role === "manager";

  const canImpersonate =
    isAdmin ||
    (isGM && target.location === requestor.location) ||
    (isManager && target.manager_id === requestor.clerk_user_id);

  if (!canImpersonate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Build permissions for target user
  const targetIsUser    = target.role === "user";
  const targetIsViewer  = target.role === "viewer";
  const targetIsManager = target.role === "manager";
  const targetIsGM      = target.role === "general_manager";

  const permissions = {
    canEditUtah:         !targetIsUser && !targetIsViewer && (target.role === "admin" || (targetIsGM && target.location === "Utah") || (targetIsManager && target.location === "Utah")),
    canEditGeorgia:      !targetIsUser && !targetIsViewer && (target.role === "admin" || (targetIsGM && target.location === "Georgia") || (targetIsManager && target.location === "Georgia")),
    canViewUtah:         target.role === "admin" || targetIsGM || targetIsViewer || (targetIsManager && target.location === "Utah") || (targetIsUser && target.location === "Utah"),
    canViewGeorgia:      target.role === "admin" || targetIsGM || targetIsViewer || (targetIsManager && target.location === "Georgia") || (targetIsUser && target.location === "Georgia"),
    canViewCPO:          !targetIsUser && !targetIsViewer,
    canManageUsers:      target.role === "admin" || target.role === "general_manager" || target.role === "manager",
    canViewAllLocations: target.role === "admin" || targetIsGM || targetIsViewer,
    canEditSchedule:     !targetIsUser && !targetIsViewer,
    canEditHistoricals:  !targetIsUser && !targetIsViewer,
    canViewScheduling:   !targetIsUser,
    canViewScorecards:   !targetIsUser && !targetIsViewer,
    isUserRole:          targetIsUser,
    isViewerRole:        targetIsViewer,
  };

  return NextResponse.json({ profile: target, permissions });
}
