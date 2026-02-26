import type { RawProspect, KanbanEvidence } from "./types";
import { throttledFetch } from "./rate-limiter";

const GOOGLE_CSE_URL = "https://www.googleapis.com/customsearch/v1";

const SEARCH_QUERIES = [
  "kanban manufacturing company",
  "kanban board manufacturing process",
  "lean kanban manufacturing case study",
  "pull system kanban manufacturer",
  "kanban implementation manufacturing plant",
];

interface GoogleCseItem {
  title?: string;
  link?: string;
  snippet?: string;
  displayLink?: string;
  pagemap?: {
    metatags?: Array<Record<string, string>>;
  };
}

interface GoogleCseResponse {
  items?: GoogleCseItem[];
  searchInformation?: { totalResults?: string };
}

function extractDomain(url: string): string | null {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    // Filter out search engines, social media, and generic sites
    const excluded = [
      "youtube.com",
      "linkedin.com",
      "facebook.com",
      "twitter.com",
      "x.com",
      "reddit.com",
      "wikipedia.org",
      "medium.com",
      "quora.com",
      "amazon.com",
      "google.com",
    ];
    if (excluded.some((d) => host === d || host.endsWith(`.${d}`))) {
      return null;
    }
    return host;
  } catch {
    return null;
  }
}

function extractCompanyName(item: GoogleCseItem): string {
  // Try metatags first (og:site_name is usually the company)
  const metatags = item.pagemap?.metatags?.[0];
  if (metatags?.["og:site_name"]) {
    return metatags["og:site_name"];
  }
  // Fall back to display link domain minus TLD
  if (item.displayLink) {
    const parts = item.displayLink.replace(/^www\./, "").split(".");
    if (parts.length >= 2) {
      return parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }
  }
  // Last resort: use title
  return item.title?.split(/[|\-–—]/)[0].trim() ?? "Unknown";
}

function itemToProspect(item: GoogleCseItem, query: string): RawProspect | null {
  const domain = extractDomain(item.link ?? "");
  if (!domain || !item.link) return null;

  const evidence: KanbanEvidence = {
    url: item.link,
    snippet: item.snippet ?? "",
    confidence: 0.5,
  };

  return {
    companyName: extractCompanyName(item),
    domain,
    industry: "Manufacturing",
    location: null,
    employeeCount: null,
    kanbanEvidence: [evidence],
    contactName: null,
    contactEmail: null,
    contactTitle: null,
    sourceType: "google_cse",
    sourceUrl: item.link,
    metadata: { searchQuery: query },
  };
}

export async function fetchGoogleCseProspects(options?: {
  maxResults?: number;
  queries?: string[];
}): Promise<RawProspect[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY;
  const engineId = process.env.GOOGLE_CSE_SEARCH_ENGINE_ID;

  if (!apiKey || !engineId) {
    console.warn("[prospecting] Google CSE credentials missing — skipping");
    return [];
  }

  const queries = options?.queries ?? SEARCH_QUERIES;
  const maxResults = options?.maxResults ?? 50;
  const seen = new Set<string>();
  const prospects: RawProspect[] = [];

  for (const query of queries) {
    if (prospects.length >= maxResults) break;

    // Google CSE returns max 10 results per request, paginate with start param
    for (let start = 1; start <= 21; start += 10) {
      if (prospects.length >= maxResults) break;

      const url = new URL(GOOGLE_CSE_URL);
      url.searchParams.set("key", apiKey);
      url.searchParams.set("cx", engineId);
      url.searchParams.set("q", query);
      url.searchParams.set("start", String(start));
      url.searchParams.set("num", "10");

      try {
        const response = await throttledFetch(url.toString(), { cache: "no-store" });
        if (!response.ok) {
          console.warn(`[prospecting] Google CSE error ${response.status} for query: ${query}`);
          break;
        }

        const data = (await response.json()) as GoogleCseResponse;
        if (!data.items?.length) break;

        for (const item of data.items) {
          const prospect = itemToProspect(item, query);
          if (!prospect || !prospect.domain || seen.has(prospect.domain)) continue;
          seen.add(prospect.domain);
          prospects.push(prospect);
        }
      } catch (error) {
        console.error(`[prospecting] Google CSE fetch failed for "${query}":`, error);
        break;
      }
    }
  }

  return prospects.slice(0, maxResults);
}
