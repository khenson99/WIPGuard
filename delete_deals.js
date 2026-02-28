const dot = require('dotenv').config({ path: '.env.local' });
const token = process.env.HUBSPOT_ACCESS_TOKEN;

const TARGET_NAMES = new Set([
  "- Prospect",
  "gh"
]);

async function deleteDeals() {
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
      console.error("Failed to fetch deals:", await res.text());
      break;
    }

    const data = await res.json();
    allDeals = allDeals.concat(data.results);
    after = data.paging?.next?.after;
  } while (after);

  console.log(`Fetched ${allDeals.length} total deals.`);
  
  const matches = allDeals.filter(d => d.properties.dealname && TARGET_NAMES.has(d.properties.dealname));
  
  console.log(`Found ${matches.length} deals matching the target names.`);
  
  for (const deal of matches) {
    console.log(`Deleting deal ID: ${deal.id} (Name: "${deal.properties.dealname}")`);
    
    try {
      const res = await fetch(`https://api.hubapi.com/crm/v3/objects/deals/${deal.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!res.ok) {
        console.error(`  Failed to delete: ${Math.floor(res.status)} ${await res.text()}`);
      } else {
        console.log(`  Successfully deleted ${deal.id}`);
      }
    } catch (e) {
      console.error(`  Error during delete:`, e);
    }
    
    // Sleep to avoid rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

deleteDeals();
