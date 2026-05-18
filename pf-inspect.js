require('dotenv').config({ path: '.env.local' });
const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Check total rows vs what the API query would return with limit(10000)
fetch(SB_URL + '/rest/v1/designer_approval_events?select=week_of,designer_name&order=week_of.asc&limit=10000', {
  headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY }
}).then(r => r.json()).then(rows => {
  console.log('Rows with limit 10000:', rows.length);
  const weeks = [...new Set(rows.map(r => r.week_of))].sort();
  console.log('Last 5 weeks:', weeks.slice(-5));
  const deanna = rows.filter(r => r.designer_name === 'Deanna Haug');
  const deannaWeeks = [...new Set(deanna.map(r => r.week_of))].sort();
  console.log('Deanna weeks:', deannaWeeks.slice(-5));
});
