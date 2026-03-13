/**
 * Cross-reference Product Images table with BW Papersystems Items table.
 *
 * For each item in BW Papersystems that has a Primary Supplier SKU but no image,
 * find a matching product image from the Product Images doc and populate it.
 *
 * Matching logic:
 *   1. Extract SKU from Product URL in Product Images (e.g., "/33350-02-02.html" → "33350-02-02")
 *   2. Normalize both SKUs (uppercase, trim)
 *   3. Try exact match, then base-number match (first numeric segment)
 *
 * Usage:
 *   CODA_API_TOKEN=<token> npx tsx scripts/cross-ref-product-images.ts
 */

// ── Config ──────────────────────────────────────────────────────────────────

const CODA_API_BASE = "https://coda.io/apis/v1";

// Product Images doc
const PRODUCT_IMAGES_DOC_ID = "c6XYKgMi1k";
const PRODUCT_IMAGES_TABLE_ID = "grid-iYATM8jDzr";
const PI_PRODUCT_URL_COL = "c-0GdLxCfYD7";
const PI_IMAGE_URL_COL = "c-Dhzi_L7LL0";
const PI_ITEM_NAME_COL = "c-t42OZnIsnI";
const PI_SKU_COL = "c-WHGdqOtF1s";

// BW Papersystems doc
const BW_DOC_ID = "QGCy4gfWUS";
const BW_ITEMS_TABLE_ID = "grid-sEvJwudjBM";
const BW_ITEM_NAME_COL = "c-a2Y-IOP3Ou";
const BW_IMAGE_COL = "c-iv90estFPo";         // Image (URL) - image type
const BW_SKU_COL = "c-MIrUFBFvNa";           // Primary Supplier SKU

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function codaHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
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

async function fetchAllRows(
  token: string,
  docId: string,
  tableId: string
): Promise<CodaRow[]> {
  const rows: CodaRow[] = [];
  let pageToken: string | null = null;

  do {
    const url = new URL(
      `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/rows`
    );
    url.searchParams.set("limit", "500");
    url.searchParams.set("valueFormat", "simple");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetch(url.toString(), {
      headers: codaHeaders(token),
    });
    if (!res.ok)
      throw new Error(`Failed to fetch rows: ${res.status} ${res.statusText}`);

    const data: CodaRowsResponse = await res.json();
    rows.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? null;
    console.log(`  Fetched ${rows.length} rows so far...`);
  } while (pageToken);

  return rows;
}

async function updateRow(
  token: string,
  docId: string,
  tableId: string,
  rowId: string,
  columnId: string,
  value: string
): Promise<boolean> {
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    await sleep(1200);

    const res = await fetch(
      `${CODA_API_BASE}/docs/${docId}/tables/${tableId}/rows/${rowId}`,
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
      const retryAfter = parseInt(
        res.headers.get("retry-after") ?? "5",
        10
      );
      const waitMs = Math.max(retryAfter * 1000, 3000 * (attempt + 1));
      process.stdout.write(`[429, waiting ${waitMs / 1000}s] `);
      await sleep(waitMs);
      continue;
    }

    const text = await res.text().catch(() => "");
    console.error(`  Update failed (${res.status}): ${text}`);
    return false;
  }

  console.error(`  Max retries reached for row ${rowId}`);
  return false;
}

// ── SKU extraction ──────────────────────────────────────────────────────────

/**
 * Extract SKU from a discounthydraulichose.com or jobsitesupplyco.com product URL.
 * e.g. "https://www.discounthydraulichose.com/33350-02-02.html" → "33350-02-02"
 * e.g. "https://www.discounthydraulichose.com/31169s-08-08.html" → "31169S-08-08"
 */
function extractSkuFromUrl(urlStr: string): string | null {
  try {
    const url = new URL(urlStr);
    const path = url.pathname;

    if (url.hostname.includes("discounthydraulichose.com")) {
      // Path like "/33350-02-02.html" → "33350-02-02"
      const match = path.match(/\/([^/]+)\.html$/);
      if (match) return match[1].toUpperCase();
    }

    if (url.hostname.includes("jobsitesupplyco.com")) {
      // Path like "/pd354916/zsi-hsn-10-hsn-loop-clamps" → extract product code
      const match = path.match(/\/pd\d+\/(.+)/);
      if (match) return match[1].toUpperCase();
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Extract the URL string from a Coda cell value (which may be a plain string,
 * an object with .url, or a rich text structure).
 */
function extractUrl(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val;
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    if (typeof obj.url === "string") return obj.url;
  }
  return "";
}

/**
 * Extract plain text from a Coda cell value (may be a simple string or
 * a slate rich text object).
 */
function extractText(val: unknown): string {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (typeof val === "object" && val !== null) {
    const obj = val as Record<string, unknown>;
    // Slate rich text
    if (obj.type === "slate" && obj.root) {
      const root = obj.root as Record<string, unknown>;
      const children = root.children as Array<Record<string, unknown>>;
      if (children) {
        return children
          .map((line) => {
            const lineChildren = line.children as Array<
              Record<string, unknown>
            >;
            return lineChildren?.map((c) => c.text ?? "").join("") ?? "";
          })
          .join("")
          .trim();
      }
    }
  }
  return String(val).trim();
}

/**
 * Normalize a SKU for matching: uppercase, trim whitespace,
 * strip trailing text after " WITH " or " W/" etc.
 */
function normalizeSku(sku: string): string {
  return sku
    .toUpperCase()
    .trim()
    .replace(/\s+WITH\s+.*$/i, "")
    .replace(/\s+W\/.*$/i, "");
}

/**
 * Extract the base product number from a SKU.
 * e.g. "31169S-08-08" → "31169S"
 * e.g. "33350-02-02" → "33350"
 */
function baseProductNumber(sku: string): string {
  const match = sku.match(/^(\d+[A-Z]?)/i);
  return match ? match[1].toUpperCase() : sku.toUpperCase();
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const token = process.env.CODA_API_TOKEN;
  if (!token) {
    console.error("Missing CODA_API_TOKEN environment variable");
    process.exit(1);
  }

  // ── Step 1: Read Product Images table ──────────────────────────────────
  console.log("📖 Reading Product Images table...");
  const piRows = await fetchAllRows(token, PRODUCT_IMAGES_DOC_ID, PRODUCT_IMAGES_TABLE_ID);
  console.log(`  ${piRows.length} rows total`);

  // Build lookup maps
  const exactSkuToImage = new Map<string, string>();  // exact SKU match (from URL or SKU column)
  const baseToImages = new Map<string, Array<{ sku: string; imageUrl: string }>>();  // base number → variants
  const itemNameToImage = new Map<string, string>();  // Item Name → image URL

  let piWithImages = 0;
  for (const row of piRows) {
    const imageUrlRaw = extractUrl(row.values[PI_IMAGE_URL_COL]);
    if (!imageUrlRaw) continue;

    piWithImages++;

    // Match by Item Name (most reliable for rows without Product URL)
    const itemName = extractText(row.values[PI_ITEM_NAME_COL]);
    if (itemName) {
      itemNameToImage.set(itemName.toUpperCase(), imageUrlRaw);
    }

    // Match by SKU column
    const skuCol = extractText(row.values[PI_SKU_COL]);
    if (skuCol) {
      const normalizedSku = normalizeSku(skuCol);
      exactSkuToImage.set(normalizedSku, imageUrlRaw);
      const base = baseProductNumber(normalizedSku);
      if (!baseToImages.has(base)) baseToImages.set(base, []);
      baseToImages.get(base)!.push({ sku: normalizedSku, imageUrl: imageUrlRaw });
    }

    // Match by SKU extracted from Product URL
    const productUrlRaw = extractUrl(row.values[PI_PRODUCT_URL_COL]);
    if (productUrlRaw) {
      const sku = extractSkuFromUrl(productUrlRaw);
      if (sku) {
        const normalizedSku = normalizeSku(sku);
        if (!exactSkuToImage.has(normalizedSku)) {
          exactSkuToImage.set(normalizedSku, imageUrlRaw);
        }
        const base = baseProductNumber(normalizedSku);
        if (!baseToImages.has(base)) baseToImages.set(base, []);
        baseToImages.get(base)!.push({ sku: normalizedSku, imageUrl: imageUrlRaw });
      }
    }
  }
  console.log(`  ${piWithImages} rows with images`);
  console.log(`  ${itemNameToImage.size} unique Item Names`);
  console.log(`  ${exactSkuToImage.size} unique SKUs, ${baseToImages.size} base product numbers`);

  // ── Step 2: Read BW Items table ────────────────────────────────────────
  console.log("\n📖 Reading BW Papersystems Items table...");
  const bwRows = await fetchAllRows(token, BW_DOC_ID, BW_ITEMS_TABLE_ID);
  console.log(`  ${bwRows.length} rows total`);

  // Find items needing images
  const needsImage: Array<{
    rowId: string;
    itemName: string;
    sku: string;
  }> = [];

  for (const row of bwRows) {
    const imageVal = extractUrl(row.values[BW_IMAGE_COL]);
    if (imageVal) continue; // already has an image

    const sku = extractText(row.values[BW_SKU_COL]);
    if (!sku) continue; // no SKU to match on

    const itemName = extractText(row.values[BW_ITEM_NAME_COL]);
    needsImage.push({ rowId: row.id, itemName, sku });
  }
  console.log(`  ${needsImage.length} items need images (have SKU, no image)`);

  // ── Step 3: Match and update ───────────────────────────────────────────
  console.log("\n🔗 Matching items to product images...");

  let matched = 0;
  let updated = 0;
  let noMatch = 0;
  const unmatched: Array<{ itemName: string; sku: string }> = [];

  for (let i = 0; i < needsImage.length; i++) {
    const item = needsImage[i];
    const normalizedSku = normalizeSku(item.sku);
    let imageUrl: string | null = null;
    let matchType = "";

    // Level 0: Match by Item Name (most common for rows without Product URL)
    const itemNameUpper = item.itemName.toUpperCase();
    if (itemNameToImage.has(itemNameUpper)) {
      imageUrl = itemNameToImage.get(itemNameUpper)!;
      matchType = "itemName";
    }

    // Level 0b: Item Name might contain "/" separator (e.g., "171214/UWA08766")
    if (!imageUrl && item.itemName.includes("/")) {
      for (const part of item.itemName.split("/")) {
        const partUpper = part.trim().toUpperCase();
        if (itemNameToImage.has(partUpper)) {
          imageUrl = itemNameToImage.get(partUpper)!;
          matchType = `itemName(${part.trim()})`;
          break;
        }
      }
    }

    // Level 1: Exact SKU match
    if (!imageUrl && exactSkuToImage.has(normalizedSku)) {
      imageUrl = exactSkuToImage.get(normalizedSku)!;
      matchType = "exactSku";
    }

    // Level 2: Base product number match (pick first variant with same base)
    if (!imageUrl) {
      const base = baseProductNumber(normalizedSku);
      const variants = baseToImages.get(base);
      if (variants && variants.length > 0) {
        imageUrl = variants[0].imageUrl;
        matchType = `base(${base}→${variants[0].sku})`;
      }
    }

    if (!imageUrl) {
      noMatch++;
      unmatched.push({ itemName: item.itemName, sku: item.sku });
      continue;
    }

    matched++;
    process.stdout.write(
      `  [${i + 1}/${needsImage.length}] ${item.itemName} (${item.sku}) → ${matchType}: `
    );

    const ok = await updateRow(
      token,
      BW_DOC_ID,
      BW_ITEMS_TABLE_ID,
      item.rowId,
      BW_IMAGE_COL,
      imageUrl
    );

    if (ok) {
      updated++;
      console.log("✅");
    } else {
      console.log("❌ update failed");
    }
  }

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("\n── Summary ──────────────────────────────────────────────");
  console.log(`Items needing images: ${needsImage.length}`);
  console.log(`Matched:              ${matched}`);
  console.log(`Updated:              ${updated}`);
  console.log(`No match found:       ${noMatch}`);

  if (unmatched.length > 0) {
    console.log(`\nUnmatched items (${unmatched.length}):`);
    for (const u of unmatched) {
      console.log(`  - ${u.itemName} (SKU: ${u.sku})`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
