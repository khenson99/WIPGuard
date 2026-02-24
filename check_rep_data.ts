import { fetchHubSpotData } from './src/lib/analytics/fetchers';

async function check() {
  const token = process.env.HUBSPOT_ACCESS_TOKEN; // Get this from local env or database if we can
  if (!token) {
    console.log("No hubspot token in env");
    return;
  }
  const to = new Date();
  const from = new Date();
  from.setDate(to.getDate() - 30);
  
  try {
    const data = await fetchHubSpotData(token, from, to);
    console.log("Deals by Rep:", JSON.stringify(data.funnel.dealsByRep, null, 2));
    console.log("Total Deals:", data.funnel.totalDeals);
  } catch (e) {
    console.error(e);
  }
}
check();
