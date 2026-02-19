import * as cheerio from "cheerio";
import type { RawProspect, KanbanEvidence } from "./types";
import { throttledFetch } from "./rate-limiter";

const KANBAN_KEYWORDS = [
  "kanban",
  "pull system",
  "lean manufacturing",
  "visual management",
  "wip limit",
  "work in progress",
  "just-in-time",
  "jit",
  "continuous flow",
];

const CONTACT_TITLE_PATTERNS = [
  /\b(ceo|cto|coo|cfo|vp|director|manager|head|lead|president|founder)\b/i,
  /\b(operations|manufacturing|production|supply chain|lean|continuous improvement)\b/i,
];

/**
 * Check robots.txt for a domain. Returns true if scraping is allowed.
 */
async function isScrapingAllowed(domain: string): Promise<boolean> {
  try {
    const response = await throttledFetch(`https://${domain}/robots.txt`);
    if (!response.ok) return true; // No robots.txt = allowed

    const text = await response.text();
    const lines = text.split("\n");
    let isRelevantAgent = false;

    for (const raw of lines) {
      const line = raw.trim().toLowerCase();
      if (line.startsWith("user-agent:")) {
        // Reset on every new User-Agent block to avoid leaking state
        const agent = line.slice("user-agent:".length).trim();
        isRelevantAgent = agent === "*" || agent.includes("wipguard");
      } else if (isRelevantAgent && line.startsWith("disallow:")) {
        const path = line.slice("disallow:".length).trim();
        // If root is disallowed, respect that
        if (path === "/") return false;
      }
    }

    return true;
  } catch {
    return true;
  }
}

function findKanbanEvidence($: cheerio.CheerioAPI, url: string): KanbanEvidence[] {
  const evidence: KanbanEvidence[] = [];
  const bodyText = $("body").text().toLowerCase();

  for (const keyword of KANBAN_KEYWORDS) {
    if (!bodyText.includes(keyword)) continue;

    // Find the paragraph/section containing the keyword
    const matches = $("p, li, h1, h2, h3, h4, td, span, div")
      .filter((_, element) => {
        const text = $(element).text().toLowerCase();
        return text.includes(keyword) && text.length < 500;
      })
      .slice(0, 3);

    matches.each((_, element) => {
      const snippet = $(element).text().trim().slice(0, 300);
      if (snippet.length > 20) {
        evidence.push({ url, snippet, confidence: 0.6 });
      }
    });
  }

  // Deduplicate by snippet similarity
  const unique: KanbanEvidence[] = [];
  for (const e of evidence) {
    const isDuplicate = unique.some(
      (u) => u.snippet.slice(0, 100) === e.snippet.slice(0, 100)
    );
    if (!isDuplicate) unique.push(e);
  }

  return unique.slice(0, 5);
}

function extractContactInfo($: cheerio.CheerioAPI): {
  name: string | null;
  email: string | null;
  title: string | null;
} {
  let email: string | null = null;
  let name: string | null = null;
  let title: string | null = null;

  // Email from mailto links
  $('a[href^="mailto:"]').each((_, element) => {
    if (!email) {
      const href = $(element).attr("href") ?? "";
      email = href.replace("mailto:", "").split("?")[0].trim();
    }
  });

  // Look for contact sections
  const contactSections = $(
    '[class*="contact"], [id*="contact"], [class*="team"], [id*="team"], [class*="about"], [id*="about"]'
  );

  contactSections.find("h2, h3, h4, p, span").each((_, element) => {
    const text = $(element).text().trim();

    // Check for title patterns
    if (!title) {
      for (const pattern of CONTACT_TITLE_PATTERNS) {
        if (pattern.test(text) && text.length < 100) {
          title = text;
          break;
        }
      }
    }

    // Simple name detection: 2-3 capitalized words before a title
    if (!name && text.length < 60) {
      const nameMatch = text.match(/^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/);
      if (nameMatch) {
        name = nameMatch[1];
      }
    }
  });

  return { name, email, title };
}

function extractCompanyInfo($: cheerio.CheerioAPI, domain: string): {
  companyName: string;
  industry: string | null;
  location: string | null;
} {
  // Company name from og:site_name or title
  const ogSiteName = $('meta[property="og:site_name"]').attr("content");
  const titleText = $("title").text().trim();
  const companyName =
    ogSiteName?.trim() ||
    titleText.split(/[|\-–—]/)[0].trim() ||
    domain.split(".")[0].charAt(0).toUpperCase() + domain.split(".")[0].slice(1);

  // Location from structured data or address elements
  let location: string | null = null;
  $('address, [itemprop="address"], [class*="address"]').each((_, element) => {
    if (!location) {
      const text = $(element).text().trim();
      if (text.length > 5 && text.length < 200) {
        location = text.replace(/\s+/g, " ");
      }
    }
  });

  // Industry from meta description or keywords
  let industry: string | null = "Manufacturing";
  const metaDesc = $('meta[name="description"]').attr("content") ?? "";
  const metaKeywords = $('meta[name="keywords"]').attr("content") ?? "";
  const combined = `${metaDesc} ${metaKeywords}`.toLowerCase();
  if (combined.includes("aerospace")) industry = "Aerospace Manufacturing";
  else if (combined.includes("automotive")) industry = "Automotive Manufacturing";
  else if (combined.includes("electronics")) industry = "Electronics Manufacturing";
  else if (combined.includes("food") || combined.includes("beverage"))
    industry = "Food & Beverage Manufacturing";
  else if (combined.includes("pharmaceutical") || combined.includes("pharma"))
    industry = "Pharmaceutical Manufacturing";

  return { companyName, industry, location };
}

export async function scrapeWebsite(
  domain: string,
  existingEvidence?: KanbanEvidence[]
): Promise<RawProspect | null> {
  if (!(await isScrapingAllowed(domain))) {
    console.log(`[prospecting] Scraping disallowed by robots.txt: ${domain}`);
    return null;
  }

  const url = `https://${domain}`;
  try {
    const response = await throttledFetch(url);
    if (!response.ok) return null;

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await response.text();
    const $ = cheerio.load(html);

    const evidence = findKanbanEvidence($, url);
    const allEvidence = [...(existingEvidence ?? []), ...evidence];

    // Only proceed if we found kanban evidence on the site
    if (allEvidence.length === 0) return null;

    const contact = extractContactInfo($);
    const company = extractCompanyInfo($, domain);

    return {
      companyName: company.companyName,
      domain,
      industry: company.industry,
      location: company.location,
      employeeCount: null,
      kanbanEvidence: allEvidence,
      contactName: contact.name,
      contactEmail: contact.email,
      contactTitle: contact.title,
      sourceType: "website_scrape",
      sourceUrl: url,
    };
  } catch (error) {
    console.error(`[prospecting] Failed to scrape ${domain}:`, error);
    return null;
  }
}

/**
 * Max websites to scrape per run to stay within the 120s timeout.
 * At 2s per request (rate limiter) + robots.txt check, each site takes ~4-6s.
 * 20 sites × ~5s = ~100s, leaving headroom.
 */
const MAX_SCRAPE_BATCH = 20;

/**
 * Scrape multiple domains, enriching existing prospects with website data.
 * Caps at MAX_SCRAPE_BATCH to avoid exceeding job timeout.
 * Prospects without domains are passed through unchanged.
 */
export async function scrapeWebsites(
  prospects: RawProspect[]
): Promise<RawProspect[]> {
  const enriched: RawProspect[] = [];

  // Separate prospects with/without domains
  const withDomain = prospects.filter((p) => p.domain);
  const withoutDomain = prospects.filter((p) => !p.domain);

  // Only scrape up to MAX_SCRAPE_BATCH; pass the rest through as-is
  const toScrape = withDomain.slice(0, MAX_SCRAPE_BATCH);
  const skipped = withDomain.slice(MAX_SCRAPE_BATCH);

  if (skipped.length > 0) {
    console.log(
      `[prospecting] Capping website scraping to ${MAX_SCRAPE_BATCH} (skipping ${skipped.length} prospects)`
    );
  }

  for (const prospect of toScrape) {
    const scraped = await scrapeWebsite(prospect.domain!, prospect.kanbanEvidence);
    if (scraped) {
      // Merge: keep the best data from both sources
      enriched.push({
        ...prospect,
        companyName: scraped.companyName || prospect.companyName,
        industry: scraped.industry || prospect.industry,
        location: scraped.location || prospect.location,
        kanbanEvidence: scraped.kanbanEvidence,
        contactName: scraped.contactName || prospect.contactName,
        contactEmail: scraped.contactEmail || prospect.contactEmail,
        contactTitle: scraped.contactTitle || prospect.contactTitle,
      });
    } else {
      enriched.push(prospect);
    }
  }

  // Pass through skipped and no-domain prospects unchanged
  enriched.push(...skipped, ...withoutDomain);

  return enriched;
}
