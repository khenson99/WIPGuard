import * as cheerio from "cheerio";
import type { RawProspect, KanbanEvidence } from "./types";
import { throttledFetch } from "./rate-limiter";

// ── AME (Association for Manufacturing Excellence) ───────────────────────────

const AME_CASE_STUDY_URL = "https://www.ame.org/target/case-studies";

async function scrapeAmeCaseStudies(): Promise<RawProspect[]> {
  const prospects: RawProspect[] = [];

  try {
    const response = await throttledFetch(AME_CASE_STUDY_URL);
    if (!response.ok) {
      console.warn(`[prospecting] AME fetch failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // AME case study listings typically have cards/articles
    $("article, .view-content .views-row, .node--type-case-study").each(
      (_, element) => {
        const card = $(element);
        const title = card.find("h2, h3, .field--name-title").text().trim();
        const link = card.find("a").first().attr("href");
        const snippet = card
          .find("p, .field--name-body, .summary")
          .first()
          .text()
          .trim()
          .slice(0, 300);

        if (!title || !snippet) return;

        // Check for kanban/lean keywords
        const combined = `${title} ${snippet}`.toLowerCase();
        const hasKanban =
          combined.includes("kanban") ||
          combined.includes("pull system") ||
          combined.includes("lean") ||
          combined.includes("visual management");

        if (!hasKanban) return;

        const sourceUrl = link
          ? link.startsWith("http")
            ? link
            : `https://www.ame.org${link}`
          : AME_CASE_STUDY_URL;

        const evidence: KanbanEvidence = {
          url: sourceUrl,
          snippet: snippet.slice(0, 300),
          confidence: 0.7,
        };

        // Try to extract company name from the case study title
        // AME titles often format as "Company Name: Achievement Description"
        const companyMatch = title.match(/^([^:–—-]+)/);
        const companyName = companyMatch ? companyMatch[1].trim() : title;

        prospects.push({
          companyName,
          domain: null, // Will be enriched by website scraper later
          industry: "Manufacturing",
          location: null,
          employeeCount: null,
          kanbanEvidence: [evidence],
          contactName: null,
          contactEmail: null,
          contactTitle: null,
          sourceType: "directory",
          sourceUrl,
          metadata: { directory: "ame" },
        });
      }
    );
  } catch (error) {
    console.error("[prospecting] AME scraping failed:", error);
  }

  return prospects;
}

// ── LEI (Lean Enterprise Institute) ──────────────────────────────────────────

const LEI_CASE_STUDY_URL = "https://www.lean.org/case-studies/";

async function scrapeLeiCaseStudies(): Promise<RawProspect[]> {
  const prospects: RawProspect[] = [];

  try {
    const response = await throttledFetch(LEI_CASE_STUDY_URL);
    if (!response.ok) {
      console.warn(`[prospecting] LEI fetch failed: ${response.status}`);
      return [];
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    // LEI case study listings
    $("article, .case-study-item, .post-item, .entry").each((_, element) => {
      const card = $(element);
      const title = card.find("h2, h3, .entry-title").text().trim();
      const link = card.find("a").first().attr("href");
      const snippet = card
        .find("p, .excerpt, .entry-summary")
        .first()
        .text()
        .trim()
        .slice(0, 300);

      if (!title) return;

      const combined = `${title} ${snippet}`.toLowerCase();
      const hasKanban =
        combined.includes("kanban") ||
        combined.includes("pull system") ||
        combined.includes("lean manufacturing") ||
        combined.includes("visual management");

      if (!hasKanban) return;

      const sourceUrl = link
        ? link.startsWith("http")
          ? link
          : `https://www.lean.org${link}`
        : LEI_CASE_STUDY_URL;

      const evidence: KanbanEvidence = {
        url: sourceUrl,
        snippet: (snippet || title).slice(0, 300),
        confidence: 0.65,
      };

      const companyMatch = title.match(/^([^:–—-]+)/);
      const companyName = companyMatch ? companyMatch[1].trim() : title;

      prospects.push({
        companyName,
        domain: null,
        industry: "Manufacturing",
        location: null,
        employeeCount: null,
        kanbanEvidence: [evidence],
        contactName: null,
        contactEmail: null,
        contactTitle: null,
        sourceType: "directory",
        sourceUrl,
        metadata: { directory: "lei" },
      });
    });
  } catch (error) {
    console.error("[prospecting] LEI scraping failed:", error);
  }

  return prospects;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function fetchDirectoryProspects(): Promise<RawProspect[]> {
  const [ameResults, leiResults] = await Promise.all([
    scrapeAmeCaseStudies(),
    scrapeLeiCaseStudies(),
  ]);

  // Deduplicate by company name (case-insensitive)
  const seen = new Set<string>();
  const combined: RawProspect[] = [];

  for (const prospect of [...ameResults, ...leiResults]) {
    const key = prospect.companyName.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    combined.push(prospect);
  }

  return combined;
}
