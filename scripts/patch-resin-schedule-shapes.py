path = '/Users/sarahferrell/Documents/pf-dashboard/src/app/api/my-dashboard/route.ts'
c = open(path).read()

old1 = '''  const rosterMap: Record<string, Record<string, { name?: string; ratio?: number; _removed?: boolean }>> = {};'''
new1 = '''  const rosterMap: Record<string, Record<string, { id?: string; name?: string; ratio?: number; _removed?: boolean }>> = {};'''
assert c.count(old1) == 1, 'old1 not found'
c = c.replace(old1, new1)

old2 = '''  // Helper: find a person's ID in a given dept roster by name match
  function findIdInRoster(rosterKey: string, name: string): string | null {
    const roster = rosterMap[rosterKey] ?? {};
    const nameLower = name.trim().toLowerCase();
    for (const [id, member] of Object.entries(roster)) {
      if (member?._removed) continue;
      if (member?.name?.trim().toLowerCase() === nameLower) return id;
    }
    return null;
  }'''
new2 = '''  // Helper: find a person in a given dept roster by name match.
  // Rosters may be objects keyed by ID or arrays (resin) — prefer member.id over the key.
  function findMemberInRoster(rosterKey: string, name: string): { id: string; ratio: number | null } | null {
    const roster = rosterMap[rosterKey] ?? {};
    const nameLower = name.trim().toLowerCase();
    for (const [key, member] of Object.entries(roster)) {
      if (member?._removed) continue;
      if (member?.name?.trim().toLowerCase() === nameLower) {
        return { id: member?.id ?? key, ratio: member?.ratio ?? null };
      }
    }
    return null;
  }
  function findIdInRoster(rosterKey: string, name: string): string | null {
    return findMemberInRoster(rosterKey, name)?.id ?? null;
  }

  // Shape-aware schedule readers. Resin stores weekly hours as {weekIndex: {memberId: hours}}
  // and daily hours keyed `${weekOffset}-${memberId}`; other depts key directly by member ID.
  function getWeeklyHours(dept: string, weeklyKey: string, id: string): number[] {
    const raw = scheduleMap[weeklyKey] ?? {};
    if (dept === 'resin') {
      return Array.from({ length: 52 }, (_, i) => {
        const wk = raw[String(i)];
        const val = wk && !Array.isArray(wk) ? (wk as Record<string, number>)[id] : undefined;
        return typeof val === 'number' ? val : 0;
      });
    }
    const arr = raw[id];
    return Array.isArray(arr) ? arr : [];
  }
  function getDailyHours(dept: string, dailyKey: string, id: string): number[] {
    const raw = scheduleMap[dailyKey] ?? {};
    const arr = dept === 'resin' ? raw[`0-${id}`] : raw[id];
    return Array.isArray(arr) ? (arr as number[]).slice(0, 5) : [];
  }'''
assert c.count(old2) == 1, 'old2 not found'
c = c.replace(old2, new2)

old3 = '''  // Target ratio comes from the roster, not actuals
  const homeRosterKey = ROSTER_KEYS[homeDeptNorm] ?? null;
  const homeRosterId = homeRosterKey ? findIdInRoster(homeRosterKey, memberName) : null;
  const targetRatio: number | null = homeRosterId && homeRosterKey
    ? (rosterMap[homeRosterKey]?.[homeRosterId]?.ratio ?? null)
    : null;

  // Prefer the home-roster ID; fall back to DESIGNER_IDS for legacy design/pres IDs
  const homeScheduleId = homeRosterId ?? designerId;
  const homeWeeklyHours: number[] = homeScheduleId
    ? (scheduleMap[homeDeptConfig.weekly]?.[homeScheduleId] ?? []) : [];
  const dailyHours: number[] = homeScheduleId
    ? (scheduleMap[homeDeptConfig.daily]?.[homeScheduleId] ?? []).slice(0, 5) : [];'''
new3 = '''  // Target ratio comes from the roster, not actuals
  const homeRosterKey = ROSTER_KEYS[homeDeptNorm] ?? null;
  const homeMember = homeRosterKey ? findMemberInRoster(homeRosterKey, memberName) : null;
  const homeRosterId = homeMember?.id ?? null;
  const targetRatio: number | null = homeMember?.ratio ?? null;

  // Prefer the home-roster ID; fall back to DESIGNER_IDS for legacy design/pres IDs
  const homeScheduleId = homeRosterId ?? designerId;
  const homeWeeklyHours: number[] = homeScheduleId
    ? [...getWeeklyHours(homeDeptNorm, homeDeptConfig.weekly, homeScheduleId)] : [];
  const dailyHours: number[] = homeScheduleId
    ? getDailyHours(homeDeptNorm, homeDeptConfig.daily, homeScheduleId) : [];
  // Current week: the daily grid is the source of truth when it has entries
  const homeDailySum = dailyHours.reduce((s, h) => s + (h ?? 0), 0);
  if (homeDailySum > 0) homeWeeklyHours[0] = Math.round(homeDailySum * 10) / 10;'''
assert c.count(old3) == 1, 'old3 not found'
c = c.replace(old3, new3)

old4 = '''    const deptWeekly: number[] = scheduleMap[dk.weekly]?.[crossId] ?? [];
    const deptDaily: number[]  = scheduleMap[dk.daily]?.[crossId]  ?? [];'''
new4 = '''    const deptWeekly: number[] = getWeeklyHours(dk.dept, dk.weekly, crossId);
    const deptDaily: number[]  = getDailyHours(dk.dept, dk.daily, crossId);'''
assert c.count(old4) == 1, 'old4 not found'
c = c.replace(old4, new4)

old5 = '''    const deptDaily: number[] = scheduleMap[dk.daily]?.[crossId] ?? [];
    if (deptDaily.some(h => h > 0)) {
      crossDeptDaily.push({ dept: dk.dept, daily: deptDaily.slice(0, 5) });
    }'''
new5 = '''    const deptDaily: number[] = getDailyHours(dk.dept, dk.daily, crossId);
    if (deptDaily.some(h => h > 0)) {
      crossDeptDaily.push({ dept: dk.dept, daily: deptDaily });
    }'''
assert c.count(old5) == 1, 'old5 not found'
c = c.replace(old5, new5)

old6 = '''  const scheduleMap: Record<string, Record<string, number[]>> = {};'''
new6 = '''  const scheduleMap: Record<string, Record<string, number[] | Record<string, number>>> = {};'''
assert c.count(old6) == 1, 'old6 not found'
c = c.replace(old6, new6)

open(path, 'w').write(c)
print('patched OK')
