path = '/Users/sarahferrell/Documents/pf-dashboard/src/app/api/my-dashboard/route.ts'
c = open(path).read()

# 1. Override department/location from the live Rippling roster
old_a = """    memberName = profile.team_member_name;
    location   = profile.location;
    department = profile.department;
  }
"""
new_a = """    memberName = profile.team_member_name;
    location   = profile.location;
    department = profile.department;
  }

  // Home department/location come from the live Rippling roster when available
  if (memberName) {
    const { data: emp } = await supabase
      .from("rippling_employees")
      .select("department, location")
      .ilike("full_name", memberName.trim())
      .eq("active", true)
      .limit(1)
      .maybeSingle();
    if (emp?.department) department = emp.department.toLowerCase();
    if (emp?.location)   location   = emp.location;
  }
"""
assert c.count(old_a) == 1, 'old_a not found'
c = c.replace(old_a, new_a)

# 2. Remove early home-schedule lookup that only used DESIGNER_IDS
old_b = """  const homeWeeklyHours: number[] = designerId
    ? (scheduleMap[homeDeptConfig.weekly]?.[designerId] ?? []) : [];
  const dailyHours: number[] = designerId
    ? (scheduleMap[homeDeptConfig.daily]?.[designerId] ?? []).slice(0, 5) : [];
"""
new_b = "  // homeWeeklyHours / dailyHours computed below after roster lookup\n"
assert c.count(old_b) == 1, 'old_b not found'
c = c.replace(old_b, new_b)

# 3. Compute home schedule hours via home-roster ID (works for resin's timestamp IDs)
old_c = """  const targetRatio: number | null = homeRosterId && homeRosterKey
    ? (rosterMap[homeRosterKey]?.[homeRosterId]?.ratio ?? null)
    : null;
"""
new_c = old_c + """
  // Prefer the home-roster ID; fall back to DESIGNER_IDS for legacy design/pres IDs
  const homeScheduleId = homeRosterId ?? designerId;
  const homeWeeklyHours: number[] = homeScheduleId
    ? (scheduleMap[homeDeptConfig.weekly]?.[homeScheduleId] ?? []) : [];
  const dailyHours: number[] = homeScheduleId
    ? (scheduleMap[homeDeptConfig.daily]?.[homeScheduleId] ?? []).slice(0, 5) : [];
"""
assert c.count(old_c) == 1, 'old_c not found'
c = c.replace(old_c, new_c)

open(path, 'w').write(c)

# 4. teamMembers.ts — allow resin as a home department, move Preslee
path2 = '/Users/sarahferrell/Documents/pf-dashboard/src/lib/teamMembers.ts'
c2 = open(path2).read()

old_d = "department: 'design' | 'preservation' | 'fulfillment';"
new_d = "department: 'design' | 'preservation' | 'fulfillment' | 'resin';"
assert c2.count(old_d) == 1, 'old_d not found'
c2 = c2.replace(old_d, new_d)

old_e = "  { name: 'Preslee Peterson',      location: 'Utah',    department: 'preservation' },"
new_e = "  { name: 'Preslee Peterson',      location: 'Utah',    department: 'resin' },"
assert c2.count(old_e) == 1, 'old_e not found'
c2 = c2.replace(old_e, new_e)

open(path2, 'w').write(c2)
print('patched OK')
