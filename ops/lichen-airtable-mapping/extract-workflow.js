export const meta = {
  name: 'lichen-eid-mapping-extract',
  description: 'Extract Coda-side Lichen item + tool-library tables to disk for eId association',
  phases: [{ title: 'Extract', detail: 'Pull both Coda tables to TSV via formula slices' }],
}

const CTX = `
You are extracting data from Coda into local TSV files so a mapping can be built.

TOOLING: use mcp__Coda__formula_execute. It runs a Coda formula and returns a string.
Extract in SLICES to stay under output limits — about 120-160 rows per call — using
Slice(start, end) which is INCLUSIVE of both bounds.

CRITICAL OUTPUT RULE: write results to the target file with the Write/Bash tools as you go.
Do NOT return the row data in your final message — return ONLY a short summary
(row counts, how many had each field populated, and any anomalies). The file is the deliverable.

Field values may contain quotes, commas and inch marks (e.g. 11 MRTL Shrink, .375 3" GAGE).
Use a TAB or the literal string ^^ as the field delimiter and ~~ as the row delimiter so
parsing is unambiguous. Strip any embedded delimiters from values with Substitute() if needed.

If a formula errors, reduce the slice size and retry. Note: on these tables, Contains() is
unreliable — avoid it. Slice/FormulaMap/Concatenate/Join all work fine.
`

phase('Extract')

const results = await parallel([
  () => agent(`${CTX}

TASK A — extract the LICHEN 6.0 ITEMS table.

Doc: coda://docs/y1n18v5VaJ  (doc title "Lichen 6.0")
Table: tables/grid-sEvJwudjBM  (name "Items", 1500 physical rows, only ~847 have a Name)

For EVERY row that has a non-blank Name, emit these fields in this order:
  1. Name
  2. Airtable Record        (column "Airtable Record" — a link/URL column; may be blank)
  3. Internal SKU
  4. Primary Supplier       (may be a lookup — coerce with .ToText() or .Join(""))
  5. Location               (may be a lookup — coerce)
  6. Item Type              (may be a lookup — coerce)

Filter to named rows first, e.g.:
  Items.Filter(Name.IsNotBlank()).Slice(1,150).FormulaMap(Concatenate(...)).Join("~~")

Write to /tmp/lichen/coda_items.tsv — one row per line, fields separated by ^^.
Convert the ~~ row delimiter to real newlines when writing the file.

Report back: total rows written, how many have a non-blank Airtable Record, how many have a
non-blank Internal SKU, and how many distinct Names there are (flag duplicates).`,
    { label: 'extract:lichen6-items', phase: 'Extract' }),

  () => agent(`${CTX}

TASK B — extract the TOOL LIBRARY table (the Airtable sync table).

Doc: coda://docs/vBHkOxvosS  (doc title "Lichen Tool Library")
Table: tables/grid-sync-11262-BaseTable-dynamic-0b1f8f443346ac6e8979ce34aee11eb4d3102c133e73179e0fb91b2e4f2cf418
Table name in formulas: [Tool Library 2]   — 628 rows

For EVERY row emit, in this order:
  1. Record id                                  (column "Record id" — the Airtable recXXXX id)
  2. Description (tool_description)             (this maps to the Arda item Name)
  3. Product ID (tool_productId)
  4. Vendor (tool_vendor)
  5. Tool Purchasing                            (coerce with .ToText() if it is a select)
  6. Record URL
  7. whether the Items link column is populated — emit the literal LINKED or UNLINKED
     using CurrentValue.Items.IsNotBlank()
  8. Items.ToText()                             (the linked Coda item name, if any)

Write to /tmp/lichen/coda_tools.tsv — one row per line, fields separated by ^^.

Report back: total rows written, how many are LINKED vs UNLINKED, how many distinct
Description values (this matters — duplicates like '11 MRTL Shrink, .375 3" GAGE' repeat many
times and will make name matching ambiguous), and the top 10 most-repeated Descriptions with counts.`,
    { label: 'extract:tool-library', phase: 'Extract' }),
])

return { summaries: results.filter(Boolean) }
