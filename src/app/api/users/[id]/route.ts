import { auth } from "@clerk/nextjs/server";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// PATCH /api/users/[id] — update a user profile (admin only)
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: requestor } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .single();

  if (requestor?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { role, location, department, team_member_name, manager_id } = body;

  const updates: Record<string, any> = {};
  if (role !== undefined) updates.role = role;
  if (location !== undefined) updates.location = location;
  if (department !== undefined) updates.department = department;
  if (team_member_name !== undefined) updates.team_member_name = team_member_name;
  if (manager_id !== undefined) updates.manager_id = manager_id;

  const { error } = await supabase
    .from("user_profiles")
    .update(updates)
    .eq("clerk_user_id", (await params).id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}

// DELETE /api/users/[id] — remove a user (admin only)
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const { data: requestor } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("clerk_user_id", userId)
    .single();

  if (requestor?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("user_profiles")
    .delete()
    .eq("clerk_user_id", (await params).id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
