import type { SemrushData } from "./types";

const SEMRUSH_BASE = "https://api.semrush.com";
const DATABASE = "us";
const TOP_KEYWORDS_LIMIT = 1000;
const ORGANIC_COMPETITORS_LIMIT = 200;

interface SemrushRow {
  [key: string]: string;
}

interface SemrushSlice<T> {
  items: T[];
  truncated: boolean;
  rowsFetched: number;
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

function parseSemrushExportLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const nextChar = line[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ";" && !inQuotes) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseSemrushResponse(text: string): SemrushRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = parseSemrushExportLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseSemrushExportLine(line);
    const row: SemrushRow = {};
    headers.forEach((header, index) => {
      row[header.trim()] = (values[index] || "").trim();
    });
    return row;
  });
}

function readNumber(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Number(value.trim().replace(/[$,%\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function fetchSemrushRows(path: string, params: URLSearchParams): Promise<SemrushRow[]> {
  const response = await fetch(`${SEMRUSH_BASE}${path}?${params.toString()}`, {
    cache: "no-store",
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
): Promise<SemrushSlice<{ keyword: string; position: number; volume: number; cpc: number; traffic: number; url: string }>> {
  const params = new URLSearchParams({
    type: "domain_organic",
    key: apiKey,
    export_columns: "Ph,Po,Nq,Cp,Tr,Ur",
    domain,
    database: DATABASE,
    display_limit: String(TOP_KEYWORDS_LIMIT + 1),
    display_sort: "tr_desc",
  });

  const rows = await fetchSemrushRows("/", params);
  const items = rows.map((row) => ({
    keyword: row["Ph"] || row["Keyword"] || "",
    position: readNumber(row["Po"] || row["Position"]),
    volume: readNumber(row["Nq"] || row["Search Volume"]),
    cpc: readNumber(row["Cp"] || row["CPC"]),
    traffic: readNumber(row["Tr"] || row["Traffic (%)"]),
    url: row["Ur"] || row["Url"] || "",
  }));
  return {
    items: items.slice(0, TOP_KEYWORDS_LIMIT),
    truncated: items.length > TOP_KEYWORDS_LIMIT,
    rowsFetched: rows.length,
  };
}

async function fetchOrganicCompetitors(
  apiKey: string,
  domain: string
): Promise<SemrushSlice<{ domain: string; commonKeywords: number; organicKeywords: number; organicTraffic: number }>> {
  const params = new URLSearchParams({
    type: "domain_organic_organic",
    key: apiKey,
    export_columns: "Dn,Np,Or,Ot",
    domain,
    database: DATABASE,
    display_limit: String(ORGANIC_COMPETITORS_LIMIT + 1),
    display_sort: "np_desc",
  });

  const rows = await fetchSemrushRows("/", params);
  const items = rows.map((row) => ({
    domain: row["Dn"] || row["Domain"] || "",
    commonKeywords: readNumber(row["Np"] || row["Common Keywords"]),
    organicKeywords: readNumber(row["Or"] || row["Organic Keywords"]),
    organicTraffic: readNumber(row["Ot"] || row["Organic Traffic"]),
  }));
  return {
    items: items.slice(0, ORGANIC_COMPETITORS_LIMIT),
    truncated: items.length > ORGANIC_COMPETITORS_LIMIT,
    rowsFetched: rows.length,
  };
}

export async function fetchSemrushData(apiKey: string, targetDomain: string): Promise<SemrushData> {
  const domain = normalizeSemrushDomain(targetDomain);

  const [overview, topKeywordResult, competitorResult] = await Promise.all([
    fetchDomainOverview(apiKey, domain),
    fetchTopKeywords(apiKey, domain),
    fetchOrganicCompetitors(apiKey, domain),
  ]);
  const truncatedResources = [
    ...(topKeywordResult.truncated ? ["topKeywords"] : []),
    ...(competitorResult.truncated ? ["organicCompetitors"] : []),
  ];

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
    topKeywords: topKeywordResult.items,
    organicCompetitors: competitorResult.items,
    _meta: {
      fetchedAt: new Date().toISOString(),
      nextRefresh: new Date(Date.now() + 3600_000).toISOString(),
      source: "live",
      truncated: truncatedResources.length > 0,
      truncatedResources,
      diagnostics: {
        topKeywordsLimit: TOP_KEYWORDS_LIMIT,
        topKeywordRowsFetched: topKeywordResult.rowsFetched,
        organicCompetitorsLimit: ORGANIC_COMPETITORS_LIMIT,
        organicCompetitorRowsFetched: competitorResult.rowsFetched,
      },
    },
  };
}
