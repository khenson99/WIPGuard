/**
 * Scrape product images from supplier websites and update the Coda "Product Images" table.
 *
 * Usage:
 *   CODA_API_TOKEN=<your-token> npx tsx scripts/scrape-product-images.ts
 *
 * The script:
 * 1. Reads all rows from the "Product Images" table in Coda doc dc6XYKgMi1k
 * 2. For each row with a Product URL but no Product Image URL, scrapes the page for the image
 * 3. Updates the Coda row with the direct image URL
 *
 * Rate-limited to 1 request per 2 seconds for polite scraping.
 * Idempotent: skips rows that already have a Product Image URL.
 */

import * as cheerio from "cheerio";
import pThrottle from "p-throttle";

// ── Config ──────────────────────────────────────────────────────────────────

const CODA_API_BASE = "https://coda.io/apis/v1";
const DOC_ID = "c6XYKgMi1k";
const FETCH_TIMEOUT_MS = 15_000;
const USER_AGENT = "WIPGuard-ProductImageScraper/1.0";

// ── Rate limiter ────────────────────────────────────────────────────────────

const throttle = pThrottle({ limit: 1, interval: 2000 });

const throttledFetch = throttle(
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
  values: Record<string, string | number | boolean | null | undefined>;
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

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`  Failed to update row ${rowId}: ${res.status} ${text}`);
    return false;
  }
  return true;
}

// ── Image extraction ────────────────────────────────────────────────────────

function extractImageFromDiscountHydraulicHose($: cheerio.CheerioAPI, pageUrl: string): string | null {
  // 1. Try schema.org JSON-LD
  const scripts = $('script[type="application/ld+json"]');
  for (let i = 0; i < scripts.length; i++) {
    try {
      const json = JSON.parse($(scripts[i]).html() ?? "");
      const image = json?.image ?? json?.["@graph"]?.[0]?.image;
      if (typeof image === "string" && image.length > 0) return image;
      if (Array.isArray(image) && typeof image[0] === "string") return image[0];
    } catch {
      // Not valid JSON, skip
    }
  }

  // 2. Try ImageMachine main image (common on this site)
  const mainImg = $("#main_image, .product_image img, .product-image img").first();
  const src = mainImg.attr("src") || mainImg.attr("data-src");
  if (src) return new URL(src, pageUrl).href;

  return null;
}

function extractImageFromJobsiteSupply($: cheerio.CheerioAPI, pageUrl: string): string | null {
  // Look for product image links/images
  const imgLink = $('a[href*="/images/product/"]').first();
  if (imgLink.length) {
    const href = imgLink.attr("href");
    if (href) return new URL(href, pageUrl).href;
  }

  // Try img tags with product images
  const productImg = $('img[src*="/images/product/"]').first();
  if (productImg.length) {
    const src = productImg.attr("src");
    if (src) return new URL(src, pageUrl).href;
  }

  return null;
}

function extractImageFallback($: cheerio.CheerioAPI, pageUrl: string): string | null {
  // 1. og:image meta tag
  const ogImage = $('meta[property="og:image"]').attr("content");
  if (ogImage) return ogImage.startsWith("http") ? ogImage : new URL(ogImage, pageUrl).href;

  // 2. First reasonably-sized product image
  const imgs = $("img");
  for (let i = 0; i < imgs.length; i++) {
    const src = $(imgs[i]).attr("src") || $(imgs[i]).attr("data-src");
    if (!src) continue;
    // Skip tiny icons, tracking pixels, logos
    const lower = src.toLowerCase();
    if (lower.includes("logo") || lower.includes("icon") || lower.includes("pixel")) continue;
    if (lower.includes("1x1") || lower.includes("spacer")) continue;
    // Prefer product-related paths
    if (
      lower.includes("product") ||
      lower.includes("main") ||
      lower.includes("graphics")
    ) {
      return src.startsWith("http") ? src : new URL(src, pageUrl).href;
    }
  }

  return null;
}

async function scrapeProductImage(productUrl: string): Promise<string | null> {
  try {
    const res = await throttledFetch(productUrl);
    if (!res.ok) {
      console.error(`  HTTP ${res.status} for ${productUrl}`);
      return null;
    }

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    const $ = cheerio.load(html);

    const hostname = new URL(productUrl).hostname;

    // Domain-specific extraction
    if (hostname.includes("discounthydraulichose.com")) {
      return extractImageFromDiscountHydraulicHose($, productUrl) ?? extractImageFallback($, productUrl);
    }
    if (hostname.includes("jobsitesupplyco.com")) {
      return extractImageFromJobsiteSupply($, productUrl) ?? extractImageFallback($, productUrl);
    }

    // Unknown domain - use fallback
    return extractImageFallback($, productUrl);
  } catch (error) {
    console.error(`  Error scraping ${productUrl}:`, error instanceof Error ? error.message : error);
    return null;
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const token = process.env.CODA_API_TOKEN?.trim();
  if (!token) {
    console.error("CODA_API_TOKEN environment variable is required.");
    console.error("Usage: CODA_API_TOKEN=<token> npx tsx scripts/scrape-product-images.ts");
    process.exit(1);
  }

  console.log("Fetching tables from Coda...");
  const tables = await fetchTables(token);
  const table = tables.find((t) => t.name.toLowerCase().includes("product images"));
  if (!table) {
    console.error("Could not find 'Product Images' table. Available tables:", tables.map((t) => t.name));
    process.exit(1);
  }
  console.log(`Found table: "${table.name}" (${table.id})`);

  console.log("Fetching columns...");
  const columns = await fetchColumns(token, table.id);
  const productUrlCol = columns.find((c) => c.name.toLowerCase() === "product url");
  const imageUrlCol = columns.find((c) => c.name.toLowerCase() === "product image url");
  if (!productUrlCol || !imageUrlCol) {
    console.error("Missing required columns. Found:", columns.map((c) => c.name));
    process.exit(1);
  }
  console.log(`Product URL column: ${productUrlCol.id}, Product Image URL column: ${imageUrlCol.id}`);

  console.log("Fetching all rows...");
  const rows = await fetchAllRows(token, table.id);
  console.log(`Total rows: ${rows.length}`);

  // Filter to rows that need image URLs
  const rowsToProcess = rows.filter((row) => {
    const productUrl = row.values[productUrlCol.id];
    const imageUrl = row.values[imageUrlCol.id];
    return (
      typeof productUrl === "string" &&
      productUrl.startsWith("http") &&
      (!imageUrl || (typeof imageUrl === "string" && imageUrl.trim() === ""))
    );
  });

  console.log(`Rows needing image URLs: ${rowsToProcess.length} (skipping ${rows.length - rowsToProcess.length} with existing images)`);
  console.log(`Estimated time: ~${Math.ceil((rowsToProcess.length * 2) / 60)} minutes\n`);

  let updated = 0;
  let failed = 0;
  let noImage = 0;

  for (let i = 0; i < rowsToProcess.length; i++) {
    const row = rowsToProcess[i]!;
    const productUrl = row.values[productUrlCol.id] as string;
    const rowLabel = row.name || row.id;

    process.stdout.write(`[${i + 1}/${rowsToProcess.length}] ${rowLabel} ... `);

    const imageUrl = await scrapeProductImage(productUrl);

    if (!imageUrl) {
      console.log("no image found");
      noImage++;
      continue;
    }

    const success = await updateRow(token, table.id, row.id, imageUrlCol.id, imageUrl);
    if (success) {
      console.log(`updated -> ${imageUrl.slice(0, 80)}...`);
      updated++;
    } else {
      failed++;
    }
  }

  console.log(`\nDone! Updated: ${updated}, No image found: ${noImage}, Failed: ${failed}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
