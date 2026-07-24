#!/usr/bin/env -S npx tsx
// One-off runner for the permanent syncRosterRoles() function — used to
// backfill isManager (and any stale role) into the live Scheduling rosters
// without duplicating the matching logic in a second script. Requires env
// vars pre-exported (see scripts/backup_schedule_settings.js for the
// pattern) since it talks to Supabase directly, not through Next.js.
import { createClient } from '@supabase/supabase-js';
import { syncRosterRoles } from '../src/lib/rosterRoleSync';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { updated } = await syncRosterRoles(supabase);
  if (updated.length === 0) {
    console.log('No roster changes.');
    return;
  }
  for (const u of updated) {
    const parts: string[] = [];
    if (u.role)      parts.push(`role: ${u.role.from ?? 'null'} -> ${u.role.to}`);
    if (u.isManager) parts.push(`isManager: ${u.isManager.from} -> ${u.isManager.to}`);
    console.log(`${u.location}/${u.roster}: ${u.name}: ${parts.join(', ')}`);
  }
  console.log(`\nDone. ${updated.length} roster member(s) updated.`);
}

main().catch(e => { console.error(e); process.exit(1); });
