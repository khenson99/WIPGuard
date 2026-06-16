/**
 * Fix broken product image URLs in the Coda "Product Images" table.
 *
 * Problem: Many discounthydraulichose.com image URLs are missing the `/mm5/`
 * path prefix, causing them to 404. This script:
 *
 * 1. Reads all rows from the "Product Images" table
 * 2. HEAD-checks each image URL to see if it's accessible
 * 3. For broken discounthydraulichose.com URLs: tries adding `/mm5/` prefix
 * 4. For still-broken URLs: re-scrapes the product page for the correct image
 * 5. Updates Coda with the fixed URL
 *
 * Usage:
 *   CODA_API_TOKEN=<your-token> npx tsx scripts/fix-product-images.ts
 *
 * Safe to re-run: only updates rows where the current URL is broken.
 */

import * as cheerio from "cheerio";
import pThrottle from "p-throttle";

// ── Config ──────────────────────────────────────────────────────────────────

const CODA_API_BASE = "https://coda.io/apis/v1";
const DOC_ID = "c6XYKgMi1k";
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "WIPGuard-ProductImageScraper/1.0";

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Rate limiters ───────────────────────────────────────────────────────────

// Scraping: 1 request per 1.5s
const scrapeThrottle = pThrottle({ limit: 1, interval: 1500 });

const throttledFetch = scrapeThrottle(
  async (url: string, init?: RequestInit): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        signal: controller.signal,
        headers: {
          "User-Agent": USER_AGENT,
          ...init?.headers,
        },
      });
    } finally {
      clearTimeout(timer);
    }
  }
);

// ── Coda API helpers ────────────────────────────────────────────────────────

interface CodaColumn {
  id: string;
  name: string;
}

interface CodaRow {
  id: string;
  name?: string;
  values: Record<string, unknown>;
}

interface CodaRowsResponse {
  items: CodaRow[];
  nextPageToken?: string;
}

function codaHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function fetchTables(token: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${CODA_API_BASE}/docs/${DOC_ID}/tables`, {
    headers: codaHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch tables: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.items ?? [];
}

async function fetchColumns(token: string, tableId: string): Promise<CodaColumn[]> {
  const res = await fetch(`${CODA_API_BASE}/docs/${DOC_ID}/tables/${tableId}/columns`, {
    headers: codaHeaders(token),
  });
  if (!res.ok) throw new Error(`Failed to fetch columns: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.items ?? [];
}

async function fetchAllRows(token: string, tableId: string): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(`${CODA_API_BASE}/docs/${DOC_ID}/tables/${tableId}/rows`);
    url.searchParams.set("limit", "500");
    url.searchParams.set("valueFormat", "simple");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: codaHeaders(token),
    });
    if (!res.ok) throw new Error(`Failed to fetch rows: ${res.status} ${res.statusText}`);

    const data: CodaRowsResponse = await res.json();
    rows.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? null;
  } while (pageToken);

  return rows;
}

async function updateRow(
  token: string,
  tableId: string,
  rowId: string,
  columnId: string,
  value: string
): Promise<boolean> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Rate limit Coda API writes
    await sleep(1200);

    const res = await fetch(
      `${CODA_API_BASE}/docs/${DOC_ID}/tables/${tableId}/rows/${rowId}`,
      {
        method: "PUT",
        headers: codaHeaders(token),
        body: JSON.stringify({
          row: {
            cells: [{ column: columnId, value }],
          },
        }),
      }
    );

    if (res.ok) return true;

    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "5", 10);
      const waitMs = Math.max(retryAfter * 1000, 3000 * (attempt + 1));
      process.stdout.write(`[429, waiting ${waitMs / 1000}s] `);
      await sleep(waitMs);
      continue;
    }

    const text = await res.text().catch(() => "");
    console.error(`  Failed to update row ${rowId}: ${res.status} ${text}`);
    return false;
  }

  console.error(`  Exhausted retries for row ${rowId}`);
  return false;
}

// ── URL extraction helper ───────────────────────────────────────────────────

function extractImageUrl(cellValue: unknown): string | null {
  if (!cellValue) return null;

  // Plain string URL
  if (typeof cellValue === "string") {
    const trimmed = cellValue.trim();
    return trimmed.startsWith("http") ? trimmed : null;
  }

  // Coda imageurlref or urlref object
  if (typeof cellValue === "object" && cellValue !== null) {
    const obj = cellValue as Record<string, unknown>;
    if (typeof obj.url === "string" && obj.url.startsWith("http")) {
      return obj.url;
    }
  }

  return null;
}

// ── Image URL validation ────────────────────────────────────────────────────

async function isImageAccessible(url: string): Promise<boolean> {
  try {
    const res = await throttledFetch(url, { method: "HEAD" });
    if (res.ok) {
      const ct = res.headers.get("content-type") ?? "";
      return ct.startsWith("image/");
    }
    return false;
  } catch {
    return false;
  }
}

// ── Fix strategies ──────────────────────────────────────────────────────────

function tryMm5Fix(imageUrl: string): string | null {
  try {
    const parsed = new URL(imageUrl);
    if (
      parsed.hostname.includes("discounthydraulichose.com") &&
      parsed.pathname.startsWith("/graphics/") &&
      !parsed.pathname.startsWith("/mm5/")
    ) {
      parsed.pathname = "/mm5" + parsed.pathname;
      return parsed.href;
    }
  } catch {
    // Invalid URL
  }
  return null;
}

// ── Re-scrape from product page ─────────────────────────────────────────────

function extractImageFromDiscountHydraulicHose(
  $: cheerio.CheerioAPI,
  pageUrl: string
): string | null {
  // 1. Schema.org JSON-LD
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const json = JSON.parse($(scripts[i]).html() ?? "");
      const image = json?.image ?? json?.["@graph"]?.[0]?.image;
      if (typeof image === "string" && image.length > 0) return image;
      if (Array.isArray(image) && typeof image[0] === "string") return image[0];
    } catch {
      // Skip invalid JSON
    }
  }

  // 2. ImageMachine main image
  const mainImg = $("#main_image, .product_image img, .product-image img").first();
  const src = mainImg.attr("src") || mainImg.attr("data-src");
  if (src) return new URL(src, pageUrl).href;

  return null;
}

function extractImageFromJobsiteSupply(
  $: cheerio.CheerioAPI,
  pageUrl: string
): string | null {
  const imgLink = $('a[href*="/images/product/"]').first();
  if (imgLink.length) {
    const href = imgLink.attr("href");
    if (href) return new URL(href, pageUrl).href;
  }

  const productImg = $('img[src*="/images/product/"]').first();
  if (productImg.length) {
    const src = productImg.attr("src");
    if (src) return new URL(src, pageUrl).href;
  }

  return null;
}

function extractImageFallback(
  $: cheerio.CheerioAPI,
  pageUrl: string
): string | null {
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) return ogImage.startsWith("http") ? ogImage : new URL(ogImage, pageUrl).href;

  const imgs = $("img");
  for (let i = 0; i < imgs.length; i++) {
    const src = $(imgs[i]).attr("src") || $(imgs[i]).attr("data-src");
    if (!src) continue;
    const lower = src.toLowerCase();
    if (lower.includes("logo") || lower.includes("icon") || lower.includes("pixel")) continue;
    if (lower.includes("1x1") || lower.includes("spacer")) continue;
    if (lower.includes("product") || lower.includes("main") || lower.includes("graphics")) {
      return src.startsWith("http") ? src : new URL(src, pageUrl).href;
    }
  }

  return null;
}

async function scrapeImageFromProductPage(productUrl: string): Promise<string | null> {
  try {
    const res = await throttledFetch(productUrl);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);
    const hostname = new URL(productUrl).hostname;

    if (hostname.includes("discounthydraulichose.com")) {
      return extractImageFromDiscountHydraulicHose($, productUrl) ?? extractImageFallback($, productUrl);
    }
    if (hostname.includes("jobsitesupplyco.com")) {
      return extractImageFromJobsiteSupply($, productUrl) ?? extractImageFallback($, productUrl);
    }

    return extractImageFallback($, productUrl);
  } catch {
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const token = process.env.CODA_API_TOKEN?.trim();
  if (!token) {
    console.error("CODA_API_TOKEN environment variable is required.");
    process.exit(1);
  }

  console.log("Fetching tables from Coda...");
  const tables = await fetchTables(token);
  const table = tables.find((t) => t.name.toLowerCase().includes("product images"));
  if (!table) {
    console.error("Could not find 'Product Images' table.");
    process.exit(1);
  }
  console.log(`Found table: "${table.name}" (${table.id})`);

  console.log("Fetching columns...");
  const columns = await fetchColumns(token, table.id);
  const productUrlCol = columns.find((c) => c.name.toLowerCase() === "product url");
  const imageUrlCol = columns.find((c) => c.name.toLowerCase() === "product image url");
  if (!productUrlCol || !imageUrlCol) {
    console.error("Missing required columns.");
    process.exit(1);
  }

  console.log("Fetching all rows...");
  const rows = await fetchAllRows(token, table.id);
  console.log(`Total rows: ${rows.length}`);

  // Gather rows with image URLs to check
  const rowsToCheck: Array<{
    row: CodaRow;
    imageUrl: string;
    productUrl: string | null;
  }> = [];

  for (const row of rows) {
    const imageUrl = extractImageUrl(row.values[imageUrlCol.id]);
    const productUrl = extractImageUrl(row.values[productUrlCol.id]);
    if (imageUrl) {
      rowsToCheck.push({ row, imageUrl, productUrl });
    }
  }

  console.log(`Rows with image URLs to check: ${rowsToCheck.length}`);
  console.log(`Rows without image URLs: ${rows.length - rowsToCheck.length}`);

  // Phase 1: Quick-fix discounthydraulichose.com URLs missing /mm5/
  const needsMm5Fix = rowsToCheck.filter((r) => tryMm5Fix(r.imageUrl) !== null);
  console.log(`\nPhase 1: ${needsMm5Fix.length} URLs potentially fixable with /mm5/ prefix`);

  let fixedMm5 = 0;
  const stillBroken: typeof rowsToCheck = [];

  for (let i = 0; i < needsMm5Fix.length; i++) {
    const { row, imageUrl } = needsMm5Fix[i]!;
    const fixedUrl = tryMm5Fix(imageUrl)!;
    const rowLabel = row.name || row.id;

    process.stdout.write(`  [${i + 1}/${needsMm5Fix.length}] ${rowLabel} ... `);

    const accessible = await isImageAccessible(fixedUrl);
    if (accessible) {
      const success = await updateRow(token, table.id, row.id, imageUrlCol.id, fixedUrl);
      if (success) {
        console.log(`fixed -> ${fixedUrl.slice(0, 70)}...`);
        fixedMm5++;
      } else {
        console.log("update failed");
        stillBroken.push(needsMm5Fix[i]!);
      }
    } else {
      console.log("still broken (mm5 didn't help)");
      stillBroken.push(needsMm5Fix[i]!);
    }
  }

  // Phase 2: Check remaining URLs that don't need /mm5/ fix
  const alreadyCorrectPath = rowsToCheck.filter((r) => tryMm5Fix(r.imageUrl) === null);
  console.log(`\nPhase 2: HEAD-checking ${alreadyCorrectPath.length} other image URLs...`);

  let alreadyOk = 0;
  for (let i = 0; i < alreadyCorrectPath.length; i++) {
    const { imageUrl } = alreadyCorrectPath[i]!;

    // Check in batches of 20, then report progress
    const accessible = await isImageAccessible(imageUrl);
    if (accessible) {
      alreadyOk++;
    } else {
      stillBroken.push(alreadyCorrectPath[i]!);
    }

    if ((i + 1) % 50 === 0 || i === alreadyCorrectPath.length - 1) {
      process.stdout.write(`  Checked ${i + 1}/${alreadyCorrectPath.length} (${stillBroken.length - needsMm5Fix.length + fixedMm5} broken so far)\r`);
    }
  }
  console.log(`\n  OK: ${alreadyOk}, Broken: ${stillBroken.length}`);

  // Phase 3: Re-scrape from product pages for anything still broken
  if (stillBroken.length > 0) {
    console.log(`\nPhase 3: Re-scraping ${stillBroken.length} broken URLs from product pages...`);

    let reScrapeFixed = 0;
    let reScrapeNoImage = 0;
    let reScrapeNoProductUrl = 0;

    for (let i = 0; i < stillBroken.length; i++) {
      const { row, productUrl, imageUrl } = stillBroken[i]!;
      const rowLabel = row.name || row.id;

      process.stdout.write(`  [${i + 1}/${stillBroken.length}] ${rowLabel} ... `);

      if (!productUrl) {
        console.log("no product URL");
        reScrapeNoProductUrl++;
        continue;
      }

      const newImageUrl = await scrapeImageFromProductPage(productUrl);

      if (!newImageUrl) {
        console.log("no image found on product page");
        reScrapeNoImage++;
        continue;
      }

      // Only update if the new URL is different and accessible
      if (newImageUrl === imageUrl) {
        console.log("same URL (site may be down)");
        reScrapeNoImage++;
        continue;
      }

      const accessible = await isImageAccessible(newImageUrl);
      if (accessible) {
        const success = await updateRow(token, table.id, row.id, imageUrlCol.id, newImageUrl);
        if (success) {
          console.log(`re-scraped -> ${newImageUrl.slice(0, 70)}...`);
          reScrapeFixed++;
        } else {
          console.log("update failed");
        }
      } else {
        console.log(`scraped URL also broken: ${newImageUrl.slice(0, 60)}`);
        reScrapeNoImage++;
      }
    }

    console.log(`\nPhase 3 results: Fixed=${reScrapeFixed}, No image=${reScrapeNoImage}, No product URL=${reScrapeNoProductUrl}`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Total rows: ${rows.length}`);
  console.log(`Phase 1 (mm5 prefix fix): ${fixedMm5} fixed`);
  console.log(`Phase 2 (already accessible): ${alreadyOk} OK`);
  console.log(`Phase 3 (re-scraped): see above`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
