require('dotenv').config({ path: '.env.local' });
const API_URL   = process.env.PF_API_URL.replace(/\/$/, '');
const API_EMAIL = process.env.PF_API_EMAIL;
const API_PASS  = process.env.PF_API_PASSWORD;

const PIPELINE = new Set([
  'bouquetReceived','checkedOn','progress','almostReadyToFrame',
  'readyToFrame','frameCompleted','disapproved','approved','noResponse',
  'readyToSeal','glued','readyToPackage','readyToFulfill','preparingToBeShipped'
]);

async function main() {
  const loginRes = await fetch(API_URL + '/Authentication/Login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: API_EMAIL, password: API_PASS })
  });
  const loginData = await loginRes.json();
  const token = loginData.jwt ?? loginData.token ?? loginData.accessToken ?? loginData.access_token;

  const totalPages = 632;

  // Check last 20 pages (newest orders)
  const pagesToCheck = [];
  for (var i = totalPages; i > totalPages - 20; i--) pagesToCheck.push(i);

  let pipelineTotal = 0;
  const statusCounts = {};

  for (const pageNum of pagesToCheck) {
    const r = await fetch(API_URL + '/OrderProducts/Search', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ searchTerm: ' ', pageSize: 50, pageNumber: pageNum })
    });
    const d = await r.json();
    if (!d.items || d.items.length === 0) { console.log('Page', pageNum, 'empty'); continue; }
    var pageHits = 0;
    d.items.forEach(function(i) {
      statusCounts[i.status] = (statusCounts[i.status] || 0) + 1;
      if (PIPELINE.has(i.status)) { pipelineTotal++; pageHits++; }
    });
    console.log('Page', pageNum, ':', pageHits, 'pipeline /', d.items.length, 'total | newest orderDate:', d.items[d.items.length-1].orderDate);
  }

  console.log('\nPipeline items in last 1000 (pages', totalPages-19, '-', totalPages + '):', pipelineTotal);
  console.log('Status breakdown:');
  Object.entries(statusCounts)
    .sort(function(a, b) { return b[1] - a[1]; })
    .forEach(function(entry) {
      var flag = PIPELINE.has(entry[0]) ? ' <-- PIPELINE' : '';
      console.log('  ' + entry[0] + ': ' + entry[1] + flag);
    });
}

main().catch(console.error);
