require('dotenv').config({ path: '.env.local' });
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(SB_URL + '/rest/v1/designer_approval_events?select=week_of&week_of=gte.2026-04-27&order=week_of.asc', {
  headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }
}).then(r => {
  console.log('Count Apr 27+:', r.headers.get('content-range'));
  return r.json();
}).then(d => console.log('Sample:', JSON.stringify(d)));
