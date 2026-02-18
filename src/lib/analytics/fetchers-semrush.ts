import type { SemrushData } from "./types";

const SEMRUSH_BASE = "https://api.semrush.com";
const DATABASE = "us";

interface SemrushRow {
  [key: string]: string;
}

function normalizeSemrushDomain(domain: string): string {
  const normalized = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "");

  if (!normalized || !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(normalized)) {
    throw new Error("SEMrush domain must be a valid root domain (for example: example.com).");
  }

  return normalized;
}

function parseSemrushResponse(text: string): SemrushRow[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];

  const headers = lines[0].split(";");
  return lines.slice(1).map((line) => {
    const values = line.split(";");
    const row: SemrushRow = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || "").trim();
    });
    return row;
  });
}

function readNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchSemrushRows(path: string, params: URLSearchParams): Promise<SemrushRow[]> {
  const response = await fetch(`${SEMRUSH_BASE}${path}?${params.toString()}`, {
    next: { revalidate: 3600 },
  });

  const text = await response.text();
  if (!response.ok || text.includes("ERROR")) {
    throw new Error(
      `SEMrush API error (${response.status}): ${text.slice(0, 300) || response.statusText}`
    );
  }

  return parseSemrushResponse(text);
}

async function fetchDomainOverview(
  apiKey: string,
  domain: string
): Promise<{
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  paidKeywords: number;
  paidTraffic: number;
  paidCost: number;
  authorityScore: number;
  backlinks: number;
}> {
  const overviewParams = new URLSearchParams({
    type: "domain_ranks",
    key: apiKey,
    export_columns: "Ot,Oc,Ad,At,Ac,Or",
    domain,
    database: DATABASE,
  });

  const rows = await fetchSemrushRows("/", overviewParams);
  const row = rows[0] || {};

  const backlinksParams = new URLSearchParams({
    type: "backlinks_overview",
    key: apiKey,
    export_columns: "ascore,total",
    target: domain,
    target_type: "root_domain",
  });

  const backlinksRows = await fetchSemrushRows("/analytics/v1/", backlinksParams);
  const backlinksRow = backlinksRows[0] || {};

  return {
    organicKeywords: readNumber(row["Or"] || row["Organic Keywords"]),
    organicTraffic: readNumber(row["Ot"] || row["Organic Traffic"]),
    organicCost: readNumber(row["Oc"] || row["Organic Cost"]),
    paidKeywords: readNumber(row["Ad"] || row["Adwords Keywords"]),
    paidTraffic: readNumber(row["At"] || row["Adwords Traffic"]),
    paidCost: readNumber(row["Ac"] || row["Adwords Cost"]),
    authorityScore: readNumber(backlinksRow["ascore"] || backlinksRow["Authority Score"]),
    backlinks: readNumber(backlinksRow["total"] || backlinksRow["Backlinks"]),
  };
}

async function fetchTopKeywords(
  apiKey: string,
  domain: string
): Promise<Array<{ keyword: string; position: number; volume: number; cpc: number; traffic: number; url: string }>> {
  const params = new URLSearchParams({
    type: "domain_organic",
    key: apiKey,
    export_columns: "Ph,Po,Nq,Cp,Tr,Ur",
    domain,
    database: DATABASE,
    display_limit: "20",
    display_sort: "tr_desc",
  });

  const rows = await fetchSemrushRows("/", params);
  return rows.map((row) => ({
    keyword: row["Ph"] || row["Keyword"] || "",
    position: readNumber(row["Po"] || row["Position"]),
    volume: readNumber(row["Nq"] || row["Search Volume"]),
    cpc: readNumber(row["Cp"] || row["CPC"]),
    traffic: readNumber(row["Tr"] || row["Traffic (%)"]),
    url: row["Ur"] || row["Url"] || "",
  }));
}

async function fetchOrganicCompetitors(
  apiKey: string,
  domain: string
): Promise<Array<{ domain: string; commonKeywords: number; organicKeywords: number; organicTraffic: number }>> {
  const params = new URLSearchParams({
    type: "domain_organic_organic",
    key: apiKey,
    export_columns: "Dn,Np,Or,Ot",
    domain,
    database: DATABASE,
    display_limit: "10",
    display_sort: "np_desc",
  });

  const rows = await fetchSemrushRows("/", params);
  return rows.map((row) => ({
    domain: row["Dn"] || row["Domain"] || "",
    commonKeywords: readNumber(row["Np"] || row["Common Keywords"]),
    organicKeywords: readNumber(row["Or"] || row["Organic Keywords"]),
    organicTraffic: readNumber(row["Ot"] || row["Organic Traffic"]),
  }));
}

export async function fetchSemrushData(apiKey: string, targetDomain: string): Promise<SemrushData> {
  const domain = normalizeSemrushDomain(targetDomain);

  const [overview, topKeywords, competitors] = await Promise.all([
    fetchDomainOverview(apiKey, domain),
    fetchTopKeywords(apiKey, domain),
    fetchOrganicCompetitors(apiKey, domain),
  ]);

  return {
    domain,
    authorityScore: overview.authorityScore,
    backlinks: overview.backlinks,
    organicKeywords: overview.organicKeywords,
    organicTraffic: overview.organicTraffic,
    organicTrafficCost: overview.organicCost,
    paidKeywords: overview.paidKeywords,
    paidTraffic: overview.paidTraffic,
    paidTrafficCost: overview.paidCost,
    topKeywords,
    organicCompetitors: competitors,
    _meta: {
      fetchedAt: new Date().toISOString(),
      nextRefresh: new Date(Date.now() + 3600_000).toISOString(),
      source: "live",
    },
  };
}
