// ─── SEMrush Fetcher ─────────────────────────────────────
// Fetches domain analytics from SEMrush API v3
// Endpoints: Domain Overview, Organic Search Keywords

import type { SemrushData } from './types';

const SEMRUSH_BASE = 'https://api.semrush.com';
const DOMAIN = 'arda.cards';
const DATABASE = 'us'; // US database

interface SemrushRow {
  [key: string]: string;
}

/**
 * Parse SEMrush CSV-style response into array of objects.
 * SEMrush returns semicolon-delimited data with header row.
 */
function parseSemrushResponse(text: string): SemrushRow[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(';');
  return lines.slice(1).map((line) => {
    const values = line.split(';');
    const row: SemrushRow = {};
    headers.forEach((h, i) => {
      row[h.trim()] = (values[i] || '').trim();
    });
    return row;
  });
}

/**
 * Fetch Domain Overview (one database) — organic & paid traffic summary
 */
async function fetchDomainOverview(apiKey: string): Promise<{
  organicKeywords: number;
  organicTraffic: number;
  organicCost: number;
  paidKeywords: number;
  paidTraffic: number;
  paidCost: number;
  authorityScore: number;
  backlinks: number;
}> {
  const params = new URLSearchParams({
    type: 'domain_ranks',
    key: apiKey,
    export_columns: 'Ot,Oc,Ad,At,Ac,Or',
    domain: DOMAIN,
    database: DATABASE,
  });

  const res = await fetch(`${SEMRUSH_BASE}/?${params}`, { next: { revalidate: 3600 } });
  const text = await res.text();

  if (!res.ok || text.includes('ERROR')) {
    console.error('[SEMrush] Domain overview error:', text.substring(0, 200));
    return { organicKeywords: 0, organicTraffic: 0, organicCost: 0, paidKeywords: 0, paidTraffic: 0, paidCost: 0, authorityScore: 0, backlinks: 0 };
  }

  const rows = parseSemrushResponse(text);
  const row = rows[0] || {};

  // Also fetch authority score via separate call
  let authorityScore = 0;
  let backlinks = 0;
  try {
    const asParams = new URLSearchParams({
      type: 'backlinks_overview',
      key: apiKey,
      export_columns: 'ascore,total',
      target: DOMAIN,
      target_type: 'root_domain',
    });
    const asRes = await fetch(`${SEMRUSH_BASE}/analytics/v1/?${asParams}`, { next: { revalidate: 3600 } });
    const asText = await asRes.text();
    if (asRes.ok && !asText.includes('ERROR')) {
      const asRows = parseSemrushResponse(asText);
      if (asRows[0]) {
        authorityScore = parseInt(asRows[0]['ascore'] || '0', 10);
        backlinks = parseInt(asRows[0]['total'] || '0', 10);
      }
    }
  } catch {
    // Authority score is optional
  }

  return {
    organicKeywords: parseInt(row['Or'] || '0', 10),
    organicTraffic: parseInt(row['Ot'] || '0', 10),
    organicCost: parseFloat(row['Oc'] || '0'),
    paidKeywords: parseInt(row['Ad'] || '0', 10),
    paidTraffic: parseInt(row['At'] || '0', 10),
    paidCost: parseFloat(row['Ac'] || '0'),
    authorityScore,
    backlinks,
  };
}

/**
 * Fetch top organic keywords for the domain
 */
async function fetchTopKeywords(apiKey: string): Promise<
  { keyword: string; position: number; volume: number; cpc: number; traffic: number; url: string }[]
> {
  const params = new URLSearchParams({
    type: 'domain_organic',
    key: apiKey,
    export_columns: 'Ph,Po,Nq,Cp,Tr,Ur',
    domain: DOMAIN,
    database: DATABASE,
    display_limit: '20',
    display_sort: 'tr_desc',
  });

  const res = await fetch(`${SEMRUSH_BASE}/?${params}`, { next: { revalidate: 3600 } });
  const text = await res.text();

  if (!res.ok || text.includes('ERROR')) {
    console.error('[SEMrush] Organic keywords error:', text.substring(0, 200));
    return [];
  }

  const rows = parseSemrushResponse(text);
  return rows.map((r) => ({
    keyword: r['Ph'] || '',
    position: parseInt(r['Po'] || '0', 10),
    volume: parseInt(r['Nq'] || '0', 10),
    cpc: parseFloat(r['Cp'] || '0'),
    traffic: parseFloat(r['Tr'] || '0'),
    url: r['Ur'] || '',
  }));
}

/**
 * Fetch organic competitors
 */
async function fetchOrganicCompetitors(apiKey: string): Promise<
  { domain: string; commonKeywords: number; organicKeywords: number; organicTraffic: number }[]
> {
  const params = new URLSearchParams({
    type: 'domain_organic_organic',
    key: apiKey,
    export_columns: 'Dn,Np,Or,Ot',
    domain: DOMAIN,
    database: DATABASE,
    display_limit: '10',
    display_sort: 'np_desc',
  });

  const res = await fetch(`${SEMRUSH_BASE}/?${params}`, { next: { revalidate: 3600 } });
  const text = await res.text();

  if (!res.ok || text.includes('ERROR')) {
    console.error('[SEMrush] Competitors error:', text.substring(0, 200));
    return [];
  }

  const rows = parseSemrushResponse(text);
  return rows.map((r) => ({
    domain: r['Dn'] || '',
    commonKeywords: parseInt(r['Np'] || '0', 10),
    organicKeywords: parseInt(r['Or'] || '0', 10),
    organicTraffic: parseInt(r['Ot'] || '0', 10),
  }));
}

/**
 * Main SEMrush fetcher — combines all sub-fetchers
 */
export async function fetchSemrushData(apiKey: string): Promise<SemrushData> {
  const [overview, topKeywords, competitors] = await Promise.all([
    fetchDomainOverview(apiKey),
    fetchTopKeywords(apiKey),
    fetchOrganicCompetitors(apiKey),
  ]);

  return {
    domain: DOMAIN,
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
      source: 'live',
    },
  };
}
