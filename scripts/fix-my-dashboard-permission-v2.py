path = "src/app/api/my-dashboard/route.ts"
with open(path) as f:
    content = f.read()

old = '''  if (memberNameParam && locationParam && departmentParam) {
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
  } else {'''

new = '''  if (memberNameParam && locationParam && departmentParam) {
    // Allowed if caller is privileged (admin/GM/manager impersonating someone else)
    // OR if the requested identity is just the caller's own profile data.
    const { data: caller } = await supabase
      .from("user_profiles")
      .select("role, team_member_name, location, department")
      .eq("clerk_user_id", userId)
      .single();
    const isPrivileged = ["admin", "general_manager", "manager"].includes(caller?.role ?? "");
    const isOwnData =
      caller?.team_member_name === memberNameParam &&
      caller?.location === locationParam &&
      caller?.department === departmentParam;
    if (!isPrivileged && !isOwnData) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    memberName = memberNameParam;
    location   = locationParam;
    department = departmentParam;
  } else {'''

count = content.count(old)
print(f"Match count: {count}")
assert count == 1, f"Expected exactly 1 match, found {count} — aborting, no changes written."
content = content.replace(old, new)
with open(path, "w") as f:
    f.write(content)
print("Patched successfully.")
