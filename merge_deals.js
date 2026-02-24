const dot = require('dotenv').config({ path: '.env.local' });
const token = process.env.HUBSPOT_ACCESS_TOKEN;

const EXCLUDED_NAMES = new Set([
  "",
  "null",
  "- Prospect",
  "Zaybra Subscription",
  "Growth via Payment Link",
  "Arda Cloud +1 more via Payment Link",
  "gh"
]);

async function mergeDeals() {
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
    if (name && EXCLUDED_NAMES.has(name)) continue;
    if (name === null && EXCLUDED_NAMES.has("null")) continue;
    
    // Also skip if the name is literally just empty or whitespace
    if (typeof name !== 'string' || name.trim() === '') continue;

    if (!nameMap[name]) nameMap[name] = [];
    nameMap[name].push(deal);
  }

  const duplicates = Object.entries(nameMap).filter(([name, deals]) => deals.length > 1);
  console.log(`Found ${duplicates.length} duplicate names to merge.`);
  
  for (const [name, deals] of duplicates) {
    console.log(`\nMerging duplicates for: "${name}"`);
    
    // Sort deals to prefer keeping the one with a non-zero amount or the most advanced stage or simply the oldest ID.
    // Let's just use the first deal as primary, and merge the rest into it.
    // Actually, sorting by amount descending so we keep the one with amount
    deals.sort((a, b) => {
        const amtA = parseFloat(a.properties.amount || "0");
        const amtB = parseFloat(b.properties.amount || "0");
        return amtB - amtA;
    });

    const primaryObjectId = deals[0].id;
    console.log(`  Primary Deal ID: ${primaryObjectId}`);

    for (let i = 1; i < deals.length; i++) {
        const objectIdToMerge = deals[i].id;
        console.log(`  Merging Deal ID: ${objectIdToMerge} into ${primaryObjectId}`);
        
        try {
            const res = await fetch('https://api.hubapi.com/crm/v3/objects/deals/merge', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    primaryObjectId,
                    objectIdToMerge
                })
            });

            if (!res.ok) {
                console.error(`  Failed to merge: ${await res.text()}`);
            } else {
                console.log(`  Successfully merged ${objectIdToMerge} into ${primaryObjectId}`);
            }
        } catch (e) {
            console.error(`  Error during merge:`, e);
        }
        
        // Sleep to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
}

mergeDeals();
