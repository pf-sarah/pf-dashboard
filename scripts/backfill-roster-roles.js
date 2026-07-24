#!/usr/bin/env node
// One-time maintenance script: corrects existing rippling_employees.role
// values using the fixed inferRole() logic (the old version in
// src/app/api/admin/employees-upload/route.ts never matched the word
// "master", so titles like "Master Design Specialist" were mistakenly
// stored as specialist), then syncs the corrected roles into the
// Scheduling rosters (schedule_settings.designRoster/presRoster/ffRoster)
// so /api/kpis's Expected/Goal projections reflect real tiers. Prints a
// full before/after diff. Run `node scripts/backup_schedule_settings.js`
// first if you haven't already today.
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const DEPT_FOR_ROSTER_KEY = {
  designRoster: 'Design',
  presRoster:   'Preservation',
  ffRoster:     'Fulfillment',
};

function inferRole(title) {
  const t = (title ?? '').toLowerCase();
  if (t.includes('manager') || t.includes('head of') || t.includes('director') || t.includes('master')) return 'master';
  if (t.includes('senior')) return 'senior';
  return 'specialist';
}

async function main() {
  console.log('=== Step 1: correcting rippling_employees.role from title ===');
  const { data: employees, error: empErr } = await supabase
    .from('rippling_employees')
    .select('id,full_name,location,department,title,role,updated_at')
    .eq('active', true);
  if (empErr) throw empErr;

  for (const e of employees) {
    const correct = inferRole(e.title);
    if (correct !== e.role) {
      console.log(`  ${e.full_name} (${e.location}/${e.department}): "${e.title}" ${e.role} -> ${correct}`);
      const { error } = await supabase.from('rippling_employees').update({ role: correct }).eq('id', e.id);
      if (error) throw error;
      e.role = correct; // keep in-memory copy current for step 2
    }
  }

  console.log('\n=== Step 2: syncing roster roles from rippling_employees ===');
  const { data: rosterRows, error: rosterErr } = await supabase
    .from('schedule_settings')
    .select('location,key,value')
    .in('key', Object.keys(DEPT_FOR_ROSTER_KEY));
  if (rosterErr) throw rosterErr;

  let updatedCount = 0;

  for (const row of rosterRows) {
    const dept = DEPT_FOR_ROSTER_KEY[row.key];
    const roster = row.value;
    let changed = false;

    for (const member of Object.values(roster)) {
      if (member._removed || !member.name) continue;

      const candidates = employees.filter(e =>
        e.location === row.location && e.full_name.trim().toLowerCase() === member.name.trim().toLowerCase()
      );
      if (candidates.length === 0) continue;

      const best =
        candidates.find(e => e.department === dept) ??
        [...candidates].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];

      if (best.role !== member.role) {
        console.log(`  ${row.location}/${row.key}: ${member.name}: ${member.role ?? 'null'} -> ${best.role}`);
        member.role = best.role;
        changed = true;
        updatedCount++;
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

  console.log(`\nDone. ${updatedCount} roster member(s) updated.`);
}

main().catch(e => { console.error(e); process.exit(1); });
