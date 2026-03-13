# Arda Retention Intelligence

This directory contains the retention analysis assets for Arda inside WIPGuard.

## What ships
- A tenant-level retention dashboard at `/analytics/retention`
- Retention APIs under `/api/retention/...`
- A retention data pipeline in `src/lib/retention`
- Rerunnable scripts in `scripts/retention`
- Methodology, source mapping, final LIR recommendation, and operator playbook

## Pipeline order
1. `scripts/retention/sync-sources.ts`
2. `scripts/retention/build-dataset.ts`
3. `scripts/retention/run-analysis.ts`
4. `scripts/retention/materialize-current.ts`
5. `scripts/retention/export-gaps.ts`

## Package scripts
- `npm run retention:sync`
- `npm run retention:build-dataset`
- `npm run retention:analyze`
- `npm run retention:materialize`
- `npm run retention:gaps`
- `npm run retention:run`

## Runtime prerequisites
- `ARDA_API_BASE_URL`
- `ARDA_API_TOKEN`
- `STRIPE_SECRET_KEY`
- `PYLON_API_KEY`
- `CODA_API_TOKEN`
- `CODA_RETENTION_DOC_ID`
- `CODA_MASTER_ORDER_ARCHIVE_TABLE_ID`

## Development prerequisite
- Coda MCP configured in Codex CLI for source discovery and schema inspection

## Notes
- `CustomerRecord.id` is the canonical tenant key used by the dashboard.
- The runtime ingestion path uses server-side APIs and database persistence; Coda MCP is used for developer-side inspection, not app runtime execution.
- Missing-source coverage is persisted and surfaced in the dashboard rather than silently excluding tenants.
- Unresolved tenant joins are exported to `docs/retention/gaps-report.md` and `docs/retention/gaps-report.json`.
