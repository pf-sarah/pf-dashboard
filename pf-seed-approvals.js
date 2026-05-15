require('dotenv').config({ path: '.env.local' });

const PF_BASE = process.env.PF_API_URL.endsWith('/') ? process.env.PF_API_URL : process.env.PF_API_URL + '/';
const SB_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SB_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY;

function toMondayWeek(dateStr) {
  const d = new Date(dateStr);
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setUTCDate(d.getUTCDate() + diff);
  return mon.toISOString().split('T')[0];
}

async function sbFetch(path, opts = {}) {
  const res = await fetch(SB_URL + path, {
    ...opts,
    headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', ...(opts.headers ?? {}) }
  });
  return res.json();
}

async function main() {
  const authRes = await fetch(PF_BASE + 'Authentication/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: process.env.PF_API_EMAIL, password: process.env.PF_API_PASSWORD })
  });
  const authJson = await authRes.json();
  const token = authJson.jwt ?? authJson.token ?? authJson.accessToken ?? authJson.access_token;
  console.log('Auth OK');

  // Source 1: order_status_history (historical approved/disapproved)
  const histRows = await sbFetch('/rest/v1/order_status_history?select=order_num,status&or=(status.eq.approved,status.eq.disapproved)&limit=5000');
  const histOrderNums = new Set(histRows.map(r => r.order_num));

  // Source 2: uuid_location_cache current status (catches recent orders)
  const cacheRows = await sbFetch('/rest/v1/uuid_location_cache?select=order_num,status&or=(status.eq.approved,status.eq.disapproved)&limit=5000');
  const cacheOrderNums = new Set(cacheRows.map(r => r.order_num));

  // Currently disapproved from both sources
  const currentlyDisapproved = new Set([
    ...histRows.filter(r => r.status === 'disapproved').map(r => r.order_num),
    ...cacheRows.filter(r => r.status === 'disapproved').map(r => r.order_num),
  ]);

  const orderNums = [...new Set([...histOrderNums, ...cacheOrderNums])];
  console.log(`Orders from order_status_history: ${histOrderNums.size}`);
  console.log(`Orders from uuid_location_cache: ${cacheOrderNums.size}`);
  console.log(`Total unique orders to process: ${orderNums.length}`);
  console.log(`Currently disapproved: ${currentlyDisapproved.size}`);

  const events = [];
  let processed = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const orderNum of orderNums) {
    try {
      const searchRes = await fetch(PF_BASE + 'OrderProducts/Search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ search: orderNum, searchTerm: orderNum, pageSize: 10, pageNumber: 1 })
      });
      const searchData = await searchRes.json();
      const items = (searchData.items ?? []).filter(i => i.shopifyOrderNumber === orderNum);

      for (const item of items) {
        const detailRes = await fetch(PF_BASE + 'OrderProducts/Details/' + item.uuid, {
          headers: { Authorization: 'Bearer ' + token }
        });
        const detail = await detailRes.json();

        for (const entry of (detail.history ?? [])) {
          if (entry.status !== 'approved' && entry.status !== 'disapproved') continue;
          const firstName = entry.assignedToUserFirstName ?? detail.assignedToUserFirstName;
          const lastName  = entry.assignedToUserLastName  ?? detail.assignedToUserLastName;
          if (!firstName && !lastName) continue;
          const name   = `${firstName ?? ''} ${lastName ?? ''}`.trim();
          const weekOf = toMondayWeek(entry.dateCreated);
          const comment = entry.status === 'disapproved' && currentlyDisapproved.has(orderNum)
            ? (detail.comment ?? null) : null;

          events.push({
            uuid: detail.uuid, order_num: orderNum, designer_name: name,
            location: detail.location ?? null,
            event_type: entry.status, event_date: entry.dateCreated,
            week_of: weekOf, comment, synced_at: now
          });
        }
      }
      processed++;
    } catch(e) { failed++; }

    if (processed % 50 === 0) console.log(`  ${processed}/${orderNums.length} processed, ${events.length} events so far...`);
    await new Promise(r => setTimeout(r, 50));
  }

  console.log(`Done fetching. ${processed} orders, ${failed} failed, ${events.length} events.`);

  // Upsert in chunks of 500
  const CHUNK = 500;
  for (let i = 0; i < events.length; i += CHUNK) {
    const chunk = events.slice(i, i + CHUNK);
    const res = await fetch(SB_URL + '/rest/v1/designer_approval_events', {
      method: 'POST',
      headers: {
        apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(chunk)
    });
    console.log(`Upserted chunk ${i}-${i+chunk.length}: HTTP ${res.status}`);
  }
  console.log('Seed complete!');
}
main().catch(console.error);
