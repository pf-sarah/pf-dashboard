require('dotenv').config({ path: '.env.local' });
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
fetch(SB_URL + '/rest/v1/designer_approval_events?select=week_of', {
  headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, Prefer: 'count=exact', 'Range-Unit': 'items', Range: '0-0' }
}).then(r => console.log('Total rows:', r.headers.get('content-range')));
