const dot = require('dotenv').config({ path: '.env.local' });
const token = process.env.HUBSPOT_ACCESS_TOKEN;

async function fetchDeals() {
  let allDeals = [];
  let after = undefined;
  
  do {
    const url = `https://api.hubapi.com/crm/v3/objects/deals?properties=dealname,amount,dealstage,pipeline&limit=100${after ? `&after=${after}` : ''}`;
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) {
      console.error(await res.text());
      break;
    }

    const data = await res.json();
    allDeals = allDeals.concat(data.results);
    after = data.paging?.next?.after;
  } while (after);

  console.log(`Fetched ${allDeals.length} deals.`);
  
  // Find duplicates by dealname
  const nameMap = {};
  for (const deal of allDeals) {
    const name = deal.properties.dealname;
    if (!nameMap[name]) nameMap[name] = [];
    nameMap[name].push(deal);
  }

  const duplicates = Object.entries(nameMap).filter(([name, deals]) => deals.length > 1);
  console.log(`Found ${duplicates.length} duplicate names.`);
  
  duplicates.forEach(([name, deals]) => {
    console.log(`\nDuplicate: "${name}"`);
    deals.forEach(d => console.log(`  - ID: ${d.id}, Stage: ${d.properties.dealstage}, Amount: ${d.properties.amount}`));
  });
}

fetchDeals();
