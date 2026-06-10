const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');
const env = Object.fromEntries(
  fs.readFileSync('.env.local', 'utf8').split('\n')
    .filter(l => l.includes('=') && !l.startsWith('#'))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()])
);
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes('--apply');

// Pull the hardcoded intake arrays straight out of SchedulePage.tsx
const src = fs.readFileSync('src/components/dashboard/SchedulePage.tsx', 'utf8');
function parseArray(name) {
  const start = src.indexOf(`const ${name}`);
  const end = src.indexOf('];', start);
  const block = src.slice(start, end);
  const re = /weekOf:\s*'([\d-]+)'\s*,\s*actual:\s*([\d.]+)/g;
  const out = {};
  let m;
  while ((m = re.exec(block))) out[m[1]] = parseFloat(m[2]);
  return out;
}
const hardcoded = { Utah: parseArray('UTAH_HISTORICAL_INTAKE'), Georgia: parseArray('GEORGIA_HISTORICAL_INTAKE') };

// Monday of the current week (skip the in-progress week)
const now = new Date();
const dow = now.getDay(); // 0=Sun
const monday = new Date(now);
monday.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
const currentMonday = monday.toISOString().split('T')[0];

(async () => {
  const existing = await sb.from('preservation_week_actuals').select('location, week_of').limit(50000);
  if (existing.error) { console.log(existing.error); process.exit(1); }
  const existingSet = new Set(existing.data.map(r => `${r.location}|${r.week_of}`));

  const ta = await sb.from('team_member_week_actuals')
    .select('location, week_of, actual_orders')
    .eq('department', 'preservation')
    .limit(50000);
  if (ta.error) { console.log(ta.error); process.exit(1); }
  const teamTotals = { Utah: {}, Georgia: {} };
  ta.data.forEach(r => {
    if (!teamTotals[r.location]) return;
    teamTotals[r.location][r.week_of] = (teamTotals[r.location][r.week_of] ?? 0) + (r.actual_orders ?? 0);
  });

  const inserts = [];
  for (const loc of ['Utah', 'Georgia']) {
    const weeks = new Set([...Object.keys(hardcoded[loc]), ...Object.keys(teamTotals[loc])]);
    [...weeks].sort().forEach(w => {
      if (w >= currentMonday) return;                       // skip in-progress week
      if (existingSet.has(`${loc}|${w}`)) return;           // never overwrite manual entries
      const val = hardcoded[loc][w] ?? teamTotals[loc][w];
      if (!val || val <= 0) return;
      inserts.push({
        location: loc,
        week_of: w,
        received: Math.round(val),
        entered_by: 'backfill_script',
        source: hardcoded[loc][w] !== undefined ? 'hardcoded' : 'team_total',
      });
    });
  }

  console.log(`Current week (skipped): ${currentMonday}`);
  console.log(`Existing rows: ${existing.data.length} | Rows to insert: ${inserts.length}`);
  console.table(inserts);

  if (!APPLY) { console.log('\nDRY RUN — re-run with --apply to insert.'); return; }

  const rows = inserts.map(({ source, ...r }) => r); // strip helper column
  for (let i = 0; i < rows.length; i += 100) {
    const res = await sb.from('preservation_week_actuals').insert(rows.slice(i, i + 100));
    if (res.error) { console.log('INSERT ERROR:', res.error); process.exit(1); }
    console.log(`inserted ${Math.min(i + 100, rows.length)}/${rows.length}`);
  }
  console.log('Backfill complete.');
})();
