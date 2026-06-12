const fs = require('fs');
const env = {};
for (const line of fs.readFileSync('/Users/sarahferrell/Documents/pf-dashboard/.env.local', 'utf8').split('\n')) {
  const i = line.indexOf('=');
  if (i > 0) env[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
}
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
(async () => {
  const { data } = await sb.from('schedule_settings').select('value').eq('location', 'Utah').eq('key', 'presRoster').single();
  const roster = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
  console.log('before:', JSON.stringify(roster['ut-p7']));
  roster['ut-p7'] = { ...roster['ut-p7'], name: 'Preslee Peterson' };
  const { error } = await sb.from('schedule_settings').update({ value: roster }).eq('location', 'Utah').eq('key', 'presRoster');
  if (error) throw error;
  console.log('after:', JSON.stringify(roster['ut-p7']));
})();
