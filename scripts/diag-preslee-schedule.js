const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('/Users/sarahferrell/Documents/pf-dashboard/.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

(async () => {
  const KEYS = ['designRoster','designHours','designDailyHours','presRoster','presHours','presDailyHours','resinRoster','resinHours','resinDailyHours'];
  const { data } = await sb.from('schedule_settings').select('key, value').eq('location', 'Utah').in('key', KEYS);
  const parsed = {};
  for (const r of data ?? []) parsed[r.key] = typeof r.value === 'string' ? JSON.parse(r.value) : r.value;

  const presleeIds = {};
  for (const k of ['designRoster','presRoster','resinRoster']) {
    const v = parsed[k];
    if (!v) { console.log(k, ': MISSING'); continue; }
    console.log(k, ': isArray =', Array.isArray(v), ', size =', Array.isArray(v) ? v.length : Object.keys(v).length);
    for (const [id, m] of Object.entries(v)) {
      if (m?.name?.toLowerCase().includes('preslee')) {
        console.log('   Preslee entry -> key:', JSON.stringify(id), 'member:', JSON.stringify(m));
        presleeIds[k] = m.id ?? id;
      }
    }
  }
  console.log('\nPreslee ids per roster:', presleeIds);

  for (const k of ['designHours','designDailyHours','presHours','presDailyHours','resinHours','resinDailyHours']) {
    const v = parsed[k];
    if (!v) { console.log('\n' + k, ': MISSING'); continue; }
    const keys = Object.keys(v);
    console.log('\n' + k, ': total keys =', keys.length, ', sample keys =', keys.slice(0, 6));
    for (const kk of keys) {
      const ids = Object.values(presleeIds).map(String);
      if (ids.some(id => kk === id || kk.includes(id))) {
        console.log('   match', JSON.stringify(kk), '->', JSON.stringify(v[kk]));
      }
    }
  }

  const { data: prof } = await sb.from('user_profiles').select('team_member_name, location, department, role').ilike('team_member_name', '%preslee%');
  console.log('\nuser_profiles:', JSON.stringify(prof));
})();
