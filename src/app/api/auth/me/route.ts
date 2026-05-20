import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("clerk_user_id", userId)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: "No profile found" }, { status: 403 });
  }

  // Derive permissions from role + location + department
  const isAdmin = profile.role === "admin";
  const isGM = profile.role === "general_manager";
  const isManager = profile.role === "manager";
  const isUser = profile.role === "user";

  const permissions = {
    canEditUtah: isAdmin || (isGM && profile.location === "Utah") || (isManager && profile.location === "Utah"),
    canEditGeorgia: isAdmin || (isGM && profile.location === "Georgia") || (isManager && profile.location === "Georgia"),
    canViewUtah: isAdmin || isGM || (isManager && profile.location === "Utah") || (isUser && profile.location === "Utah"),
    canViewGeorgia: isAdmin || isGM || (isManager && profile.location === "Georgia") || (isUser && profile.location === "Georgia"),
    canViewCPO: !isUser,
    canManageUsers: isAdmin,
    canViewAllLocations: isAdmin || isGM,
    canEditSchedule: isAdmin || isGM || isManager,
    canEditHistoricals: isAdmin || isGM || isManager,
    isUserRole: isUser,
  };

  return NextResponse.json({ profile, permissions });
}
