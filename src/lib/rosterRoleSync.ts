import type { SupabaseClient } from '@supabase/supabase-js';
import type { RatioTier } from './ratioTargets';

// Keeps each Scheduling roster member's `role` (Master/Senior/Specialist,
// used by /api/kpis to project Expected/Goal ratios) and `isManager` (used
// to exclude managers from the Expected/Goal wage-tier lookup — their pay
// reflects management responsibility, not a production tier) in sync with
// the real job title on file in rippling_employees (populated by the
// employees upload — see employees-upload/route.ts's inferRole). Call this
// after any change to rippling_employees so title/manager changes propagate
// automatically instead of roster fields silently going stale.
//
// Matching: by name + location. A person can have separate titles per
// department (flex workers), so a same-department title is preferred;
// otherwise falls back to their most recently uploaded title from any
// department. Existing roster fields are overwritten — this is the intended
// behavior, not just a one-time backfill.

const DEPT_FOR_ROSTER_KEY: Record<string, string> = {
  designRoster: 'Design',
  presRoster:   'Preservation',
  ffRoster:     'Fulfillment',
};

const MANAGER_TITLE_RE = /manager|head of|director/i;

interface RipplingEmployeeRow {
  full_name:  string;
  location:   string;
  department: string;
  title:      string;
  role:       RatioTier;
  updated_at: string;
}

interface RosterMemberRow {
  name:       string;
  role?:      RatioTier;
  isManager?: boolean;
  _removed?:  boolean;
  [key: string]: unknown;
}

export interface RosterFieldUpdate {
  location:   string;
  roster:     string;
  name:       string;
  role?:      { from: RatioTier | null; to: RatioTier };
  isManager?: { from: boolean; to: boolean };
}

export interface RosterRoleSyncResult {
  updated: RosterFieldUpdate[];
}

export async function syncRosterRoles(supabase: SupabaseClient): Promise<RosterRoleSyncResult> {
  const [{ data: employees, error: empErr }, { data: rosterRows, error: rosterErr }] = await Promise.all([
    supabase.from('rippling_employees').select('full_name,location,department,title,role,updated_at').eq('active', true),
    supabase.from('schedule_settings').select('location,key,value').in('key', Object.keys(DEPT_FOR_ROSTER_KEY)),
  ]);
  if (empErr)    throw empErr;
  if (rosterErr) throw rosterErr;

  const updated: RosterFieldUpdate[] = [];

  for (const row of rosterRows ?? []) {
    const dept   = DEPT_FOR_ROSTER_KEY[row.key];
    const roster = row.value as Record<string, RosterMemberRow>;
    let changed  = false;

    for (const member of Object.values(roster)) {
      if (member._removed || !member.name) continue;

      const candidates = ((employees ?? []) as RipplingEmployeeRow[]).filter(e =>
        e.location === row.location && e.full_name.trim().toLowerCase() === member.name.trim().toLowerCase()
      );
      if (candidates.length === 0) continue;

      const best =
        candidates.find(e => e.department === dept) ??
        [...candidates].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

      const isManager = MANAGER_TITLE_RE.test(best.title ?? '');
      const update: RosterFieldUpdate = { location: row.location, roster: row.key, name: member.name };
      let memberChanged = false;

      if (best.role !== member.role) {
        update.role = { from: member.role ?? null, to: best.role };
        member.role = best.role;
        memberChanged = true;
      }
      if (isManager !== !!member.isManager) {
        update.isManager = { from: !!member.isManager, to: isManager };
        member.isManager = isManager;
        memberChanged = true;
      }

      if (memberChanged) {
        updated.push(update);
        changed = true;
      }
    }

    if (changed) {
      const { error } = await supabase
        .from('schedule_settings')
        .upsert(
          { location: row.location, key: row.key, value: roster, updated_by: 'role-sync', updated_at: new Date().toISOString() },
          { onConflict: 'location,key' }
        );
      if (error) throw error;
    }
  }

  return { updated };
}
