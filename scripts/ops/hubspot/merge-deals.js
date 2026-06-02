const dotenv = require("dotenv");

const HUBSPOT_BASE = "https://api.hubapi.com";
const MAIN_PIPELINE_ID = "default";
const SUBSCRIPTION_PIPELINE_ID = "1390107368";

const MANUAL_DEAL_MERGES = [
  {
    primaryObjectId: "79658864346",
    objectIdToMerge: "138720011979",
    reason: "Egg Collective closed-lost duplicate should resolve into the active closed-won deal.",
    matchType: "manual",
  },
  {
    primaryObjectId: "79676947156",
    objectIdToMerge: "139322884826",
    reason: "Lichen Precision closed-lost duplicate should resolve into the active closed-won deal.",
    matchType: "manual",
  },
  {
    primaryObjectId: "79675150072",
    objectIdToMerge: "139080299207",
    reason: "Super Pacific closed-lost duplicate should resolve into the active closed-won deal.",
    matchType: "manual",
  },
  {
    primaryObjectId: "79675150072",
    objectIdToMerge: "304667726544",
    reason: "Super Pacific duplicate should resolve into the active closed-won deal.",
    matchType: "manual",
  },
];

const MANUAL_COMPANY_MERGES = [
  {
    primaryObjectId: "76096495311",
    objectIdToMerge: "75923518183",
    reason: "Super Pacific duplicate companies should consolidate into the company attached to the primary deal.",
    matchType: "manual",
  },
];

function normalizeText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeCompanyName(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function toTimestamp(value) {
  const time = Date.parse(String(value ?? ""));
  return Number.isFinite(time) ? time : null;
}

function resolveCanonicalId(id, mergeMap) {
  let current = id;
  const seen = new Set();
  while (mergeMap.has(current) && !seen.has(current)) {
    seen.add(current);
    current = mergeMap.get(current);
  }
  return current;
}

function isClosedWon(stageId) {
  return normalizeText(stageId) === "closedwon";
}

function choosePrimaryDeal(deals) {
  const sorted = [...deals].sort((a, b) => {
    if (isClosedWon(a.stageId) !== isClosedWon(b.stageId)) {
      return isClosedWon(a.stageId) ? -1 : 1;
    }

    const updatedDiff = (toTimestamp(b.updatedAt) ?? 0) - (toTimestamp(a.updatedAt) ?? 0);
    if (updatedDiff !== 0) return updatedDiff;

    const createdA = toTimestamp(a.createdAt);
    const createdB = toTimestamp(b.createdAt);
    if (createdA !== null || createdB !== null) {
      if (createdA === null) return 1;
      if (createdB === null) return -1;
      if (createdA !== createdB) return createdA - createdB;
    }

    return String(a.id).localeCompare(String(b.id));
  });
  return sorted[0] ?? null;
}

function choosePrimaryCompany(companies, preferredCompanyId) {
  if (preferredCompanyId) {
    const preferred = companies.find((company) => company.id === preferredCompanyId);
    if (preferred) return preferred;
  }

  const sorted = [...companies].sort((a, b) => {
    const aHasDomain = normalizeText(a.domain).length > 0;
    const bHasDomain = normalizeText(b.domain).length > 0;
    if (aHasDomain !== bHasDomain) return aHasDomain ? -1 : 1;

    const createdA = toTimestamp(a.createdAt);
    const createdB = toTimestamp(b.createdAt);
    if (createdA !== null || createdB !== null) {
      if (createdA === null) return 1;
      if (createdB === null) return -1;
      if (createdA !== createdB) return createdA - createdB;
    }

    return String(a.id).localeCompare(String(b.id));
  });
  return sorted[0] ?? null;
}

function collectCustomerSignals(deal, companiesById, contactsById) {
  const companies = unique(deal.companyIds || [])
    .map((companyId) => companiesById.get(companyId))
    .filter(Boolean);
  const contacts = unique(deal.contactIds || [])
    .map((contactId) => contactsById.get(contactId))
    .filter(Boolean);

  return {
    companies,
    contacts,
    domains: unique(companies.map((company) => normalizeText(company.domain))),
    emails: unique(contacts.map((contact) => normalizeText(contact.email))),
    companyNames: unique(companies.map((company) => normalizeCompanyName(company.name))),
  };
}

function buildCustomerIndexes(mainDeals, companiesById, contactsById) {
  const byDomain = new Map();
  const byEmail = new Map();
  const byCompanyName = new Map();

  const addToIndex = (index, key, deal) => {
    if (!key) return;
    const existing = index.get(key) || [];
    existing.push(deal);
    index.set(key, existing);
  };

  for (const deal of mainDeals) {
    const signals = collectCustomerSignals(deal, companiesById, contactsById);
    for (const domain of signals.domains) addToIndex(byDomain, domain, deal);
    for (const email of signals.emails) addToIndex(byEmail, email, deal);
    for (const name of signals.companyNames) addToIndex(byCompanyName, name, deal);
  }

  return { byDomain, byEmail, byCompanyName };
}

function findMainDealMatch(subscriptionDeal, indexes, companiesById, contactsById) {
  const signals = collectCustomerSignals(subscriptionDeal, companiesById, contactsById);

  for (const domain of signals.domains) {
    const matches = indexes.byDomain.get(domain) || [];
    if (matches.length > 0) return { matchType: "company_domain", candidates: matches };
  }

  for (const email of signals.emails) {
    const matches = indexes.byEmail.get(email) || [];
    if (matches.length > 0) return { matchType: "contact_email", candidates: matches };
  }

  for (const name of signals.companyNames) {
    const matches = indexes.byCompanyName.get(name) || [];
    if (matches.length > 0) return { matchType: "company_name", candidates: matches };
  }

  return { matchType: "unmatched", candidates: [] };
}

function shouldMergeCompanies(matchType, primaryCompany, secondaryCompany) {
  if (!primaryCompany || !secondaryCompany) return false;
  if (primaryCompany.id === secondaryCompany.id) return false;

  if (matchType === "company_domain") {
    return normalizeText(primaryCompany.domain) !== "" &&
      normalizeText(primaryCompany.domain) === normalizeText(secondaryCompany.domain);
  }

  if (matchType === "company_name") {
    return normalizeCompanyName(primaryCompany.name) !== "" &&
      normalizeCompanyName(primaryCompany.name) === normalizeCompanyName(secondaryCompany.name);
  }

  return matchType === "contact_email";
}

function isMainPipelineDeal(deal) {
  return normalizeText(deal.pipelineId) === "" || deal.pipelineId === MAIN_PIPELINE_ID;
}

function buildCleanupPlan({ deals, companies, contacts }) {
  const companiesById = new Map(companies.map((company) => [company.id, company]));
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));

  const dealCanonicalMap = new Map();
  const companyCanonicalMap = new Map();

  const dealMerges = [];
  const companyMerges = [];
  const review = [];

  const seenDealMerges = new Set();
  const seenCompanyMerges = new Set();

  const addDealMerge = (merge) => {
    const secondaryId = resolveCanonicalId(merge.objectIdToMerge, dealCanonicalMap);
    const primaryId = resolveCanonicalId(merge.primaryObjectId, dealCanonicalMap);
    if (!secondaryId || !primaryId || secondaryId === primaryId) return;

    const dedupeKey = `${primaryId}->${secondaryId}`;
    if (seenDealMerges.has(dedupeKey)) return;

    dealCanonicalMap.set(secondaryId, primaryId);
    seenDealMerges.add(dedupeKey);
    dealMerges.push({ ...merge, primaryObjectId: primaryId, objectIdToMerge: secondaryId });
  };

  const addCompanyMerge = (merge) => {
    const secondaryId = resolveCanonicalId(merge.objectIdToMerge, companyCanonicalMap);
    const primaryId = resolveCanonicalId(merge.primaryObjectId, companyCanonicalMap);
    if (!secondaryId || !primaryId || secondaryId === primaryId) return;

    const dedupeKey = `${primaryId}->${secondaryId}`;
    if (seenCompanyMerges.has(dedupeKey)) return;

    companyCanonicalMap.set(secondaryId, primaryId);
    seenCompanyMerges.add(dedupeKey);
    companyMerges.push({ ...merge, primaryObjectId: primaryId, objectIdToMerge: secondaryId });
  };

  for (const merge of MANUAL_DEAL_MERGES) addDealMerge(merge);
  for (const merge of MANUAL_COMPANY_MERGES) addCompanyMerge(merge);

  const manualSecondaryDealIds = new Set(MANUAL_DEAL_MERGES.map((merge) => merge.objectIdToMerge));
  const mainDeals = deals.filter(
    (deal) => isMainPipelineDeal(deal) && !manualSecondaryDealIds.has(deal.id),
  );
  const indexes = buildCustomerIndexes(mainDeals, companiesById, contactsById);

  const subscriptionDeals = deals.filter((deal) => deal.pipelineId === SUBSCRIPTION_PIPELINE_ID);
  for (const subscriptionDeal of subscriptionDeals) {
    const match = findMainDealMatch(subscriptionDeal, indexes, companiesById, contactsById);
    if (match.candidates.length === 0) {
      const signals = collectCustomerSignals(subscriptionDeal, companiesById, contactsById);
      review.push({
        dealId: subscriptionDeal.id,
        dealName: subscriptionDeal.name,
        reason: "No main-pipeline customer match found for subscription deal.",
        companyNames: signals.companies.map((company) => company.name),
        domains: signals.domains.filter(Boolean),
        emails: signals.emails.filter(Boolean),
      });
      continue;
    }

    const canonicalCandidates = unique(
      match.candidates.map((candidate) => resolveCanonicalId(candidate.id, dealCanonicalMap)),
    )
      .map((dealId) => deals.find((candidate) => candidate.id === dealId))
      .filter(Boolean);

    const primaryDeal = choosePrimaryDeal(canonicalCandidates);
    if (!primaryDeal || primaryDeal.id === subscriptionDeal.id) continue;

    addDealMerge({
      primaryObjectId: primaryDeal.id,
      objectIdToMerge: subscriptionDeal.id,
      reason: `Subscription-pipeline deal matched to main-pipeline customer via ${match.matchType}.`,
      matchType: match.matchType,
    });

    const primarySignals = collectCustomerSignals(primaryDeal, companiesById, contactsById);
    const secondarySignals = collectCustomerSignals(subscriptionDeal, companiesById, contactsById);
    const primaryCompany = choosePrimaryCompany(primarySignals.companies, primaryDeal.companyIds?.[0] ?? null);
    const secondaryCompany = choosePrimaryCompany(secondarySignals.companies, subscriptionDeal.companyIds?.[0] ?? null);

    if (shouldMergeCompanies(match.matchType, primaryCompany, secondaryCompany)) {
      addCompanyMerge({
        primaryObjectId: primaryCompany.id,
        objectIdToMerge: secondaryCompany.id,
        reason: `Company merge required after subscription-pipeline match via ${match.matchType}.`,
        matchType: match.matchType,
      });
    }
  }

  return {
    dealMerges,
    companyMerges,
    review,
    summary: {
      mainPipelineId: MAIN_PIPELINE_ID,
      excludedSubscriptionPipelineId: SUBSCRIPTION_PIPELINE_ID,
      manualDealMerges: MANUAL_DEAL_MERGES.length,
      manualCompanyMerges: MANUAL_COMPANY_MERGES.length,
      plannedDealMerges: dealMerges.length,
      plannedCompanyMerges: companyMerges.length,
      reviewCount: review.length,
    },
  };
}

async function hubspotFetchJson(token, url, init = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok) {
    throw new Error(`${response.status} ${await response.text().catch(() => "HubSpot request failed")}`);
  }

  return response.json();
}

async function fetchAllObjects(token, objectType, properties) {
  const results = [];
  let after;

  for (;;) {
    const url = new URL(`${HUBSPOT_BASE}/crm/v3/objects/${objectType}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", properties);
    if (after) url.searchParams.set("after", after);

    const payload = await hubspotFetchJson(token, url.toString());
    results.push(...(payload.results || []));
    after = payload.paging?.next?.after;
    if (!after) break;
  }

  return results;
}

async function fetchDealAssociations(token, dealIds, pathSegment) {
  const associations = new Map();
  const batchSize = 100;

  for (let index = 0; index < dealIds.length; index += batchSize) {
    const batch = dealIds.slice(index, index + batchSize);
    const payload = await hubspotFetchJson(
      token,
      `${HUBSPOT_BASE}/crm/v4/associations/deal/${pathSegment}/batch/read`,
      {
        method: "POST",
        body: JSON.stringify({
          inputs: batch.map((id) => ({ id })),
        }),
      },
    );

    for (const row of payload.results || []) {
      const fromId = String(row.from?.id ?? "");
      const targetIds = unique(
        (row.to || [])
          .map((target) => String(target.toObjectId ?? ""))
          .filter(Boolean),
      );
      if (fromId) associations.set(fromId, targetIds);
    }
  }

  for (const dealId of dealIds) {
    if (!associations.has(dealId)) associations.set(dealId, []);
  }

  return associations;
}

async function loadHubSpotCleanupData(token) {
  const [dealRows, companyRows, contactRows] = await Promise.all([
    fetchAllObjects(token, "deals", "dealname,dealstage,amount,pipeline,createdate,hs_lastmodifieddate"),
    fetchAllObjects(token, "companies", "name,domain,createdate,hs_lastmodifieddate"),
    fetchAllObjects(token, "contacts", "firstname,lastname,email,createdate,lastmodifieddate"),
  ]);

  const dealIds = dealRows.map((deal) => String(deal.id)).filter(Boolean);
  const [dealCompanies, dealContacts] = await Promise.all([
    fetchDealAssociations(token, dealIds, "company"),
    fetchDealAssociations(token, dealIds, "contact"),
  ]);

  return {
    deals: dealRows.map((deal) => ({
      id: String(deal.id ?? ""),
      name: String(deal.properties?.dealname ?? ""),
      stageId: String(deal.properties?.dealstage ?? ""),
      pipelineId: String(deal.properties?.pipeline ?? ""),
      amount: Number(deal.properties?.amount ?? 0),
      createdAt: deal.properties?.createdate ?? null,
      updatedAt: deal.properties?.hs_lastmodifieddate ?? null,
      companyIds: dealCompanies.get(String(deal.id ?? "")) || [],
      contactIds: dealContacts.get(String(deal.id ?? "")) || [],
    })),
    companies: companyRows.map((company) => ({
      id: String(company.id ?? ""),
      name: String(company.properties?.name ?? ""),
      domain: company.properties?.domain ?? null,
      createdAt: company.properties?.createdate ?? null,
      updatedAt: company.properties?.hs_lastmodifieddate ?? null,
    })),
    contacts: contactRows.map((contact) => ({
      id: String(contact.id ?? ""),
      firstName: contact.properties?.firstname ?? "",
      lastName: contact.properties?.lastname ?? "",
      email: contact.properties?.email ?? null,
      createdAt: contact.properties?.createdate ?? null,
      updatedAt: contact.properties?.lastmodifieddate ?? null,
    })),
  };
}

async function mergeHubSpotObjects(token, objectType, merges) {
  for (const merge of merges) {
    const response = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/${objectType}/merge`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        primaryObjectId: merge.primaryObjectId,
        objectIdToMerge: merge.objectIdToMerge,
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to merge ${objectType} ${merge.objectIdToMerge} -> ${merge.primaryObjectId}: ${await response.text().catch(() => "merge failed")}`,
      );
    }
  }
}

async function applyCleanupPlan(token, plan) {
  await mergeHubSpotObjects(token, "deals", plan.dealMerges);
  await mergeHubSpotObjects(token, "companies", plan.companyMerges);
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    apply: args.has("--apply"),
    json: args.has("--json"),
  };
}

function loadHubSpotAccessToken() {
  dotenv.config({ path: ".env.local" });
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  if (!token) {
    throw new Error("HUBSPOT_ACCESS_TOKEN is required in .env.local");
  }
  return token;
}

function printPlan(plan, asJson) {
  if (asJson) {
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  console.log(`Main pipeline: ${plan.summary.mainPipelineId}`);
  console.log(`Excluded subscription pipeline: ${plan.summary.excludedSubscriptionPipelineId}`);
  console.log(`Planned deal merges: ${plan.summary.plannedDealMerges}`);
  console.log(`Planned company merges: ${plan.summary.plannedCompanyMerges}`);
  console.log(`Needs review: ${plan.summary.reviewCount}`);

  if (plan.dealMerges.length > 0) {
    console.log("\nDeal merges:");
    for (const merge of plan.dealMerges) {
      console.log(`- ${merge.objectIdToMerge} -> ${merge.primaryObjectId} [${merge.matchType}] ${merge.reason}`);
    }
  }

  if (plan.companyMerges.length > 0) {
    console.log("\nCompany merges:");
    for (const merge of plan.companyMerges) {
      console.log(`- ${merge.objectIdToMerge} -> ${merge.primaryObjectId} [${merge.matchType}] ${merge.reason}`);
    }
  }

  if (plan.review.length > 0) {
    console.log("\nReview queue:");
    for (const item of plan.review.slice(0, 25)) {
      console.log(`- ${item.dealId} ${item.dealName} :: ${item.reason}`);
    }
    if (plan.review.length > 25) {
      console.log(`... ${plan.review.length - 25} additional review items omitted`);
    }
  }
}

async function executeCli(argv = process.argv) {
  const token = loadHubSpotAccessToken();
  const options = parseArgs(argv);
  const data = await loadHubSpotCleanupData(token);
  const plan = buildCleanupPlan(data);

  if (!options.apply) {
    printPlan(plan, options.json);
    return plan;
  }

  await applyCleanupPlan(token, plan);
  printPlan(plan, options.json);
  return plan;
}

if (require.main === module) {
  executeCli().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}

module.exports = {
  MAIN_PIPELINE_ID,
  SUBSCRIPTION_PIPELINE_ID,
  MANUAL_DEAL_MERGES,
  MANUAL_COMPANY_MERGES,
  normalizeCompanyName,
  choosePrimaryDeal,
  choosePrimaryCompany,
  buildCleanupPlan,
  loadHubSpotCleanupData,
  applyCleanupPlan,
  executeCli,
};
