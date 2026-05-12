# Runbook: PR Review Regression Checklist

## Goal

Catch route-contract and shared-UI regressions before merge, especially when large PRs touch dashboard pages, E2E entrypoints, or analytics presentation components.

## Trigger

- Any PR that changes files under `src/app/(dashboard)`.
- Any PR that changes user-facing copy in shared analytics or dashboard components.
- Any broad squash-merge PR with many unrelated file edits.

## Checklist

### Route contracts

- If a PR changes a routed page such as `src/app/(dashboard)/tasks/page.tsx`, confirm the route's behavior is still intentional:
  - authenticated render target
  - unauthenticated redirect target
  - any compatibility redirects
- Require one of:
  - a route-level unit test for that page
  - matching E2E updates in the same PR

### E2E dependency scan

- Search `tests/e2e` for direct references to the changed route.
- Check helper objects in `tests/e2e/helpers/pages.ts` for hard-coded navigation targets.
- If the route changed, verify the affected specs still exercise the intended surface:
  - `tests/e2e/auth.spec.ts`
  - `tests/e2e/board.spec.ts`
  - `tests/e2e/settings.spec.ts`

### Shared visible copy

- If a PR changes empty-state titles, CTA copy, headings, or status text in a shared component, update the nearest rendering assertions in the same diff.
- For analytics changes, review the component and its page-level tests together.
- Prefer page/composition-layer assertions when multiple pages render the same shared component.

### Large PR blast radius

- For broad PRs, scan the changed-file list for:
  - routed pages under `src/app/(dashboard)`
  - shared components under `src/components/analytics`
  - E2E helpers under `tests/e2e/helpers`
- If a route file changed and no related tests changed, stop review and ask for coverage.
- If visible copy changed and nearby tests still assert old text, stop review and ask for the assertion update.

## WIPGuard Example

The March 15-16, 2026 regression cluster would have been caught by this checklist:

- `src/app/(dashboard)/tasks/page.tsx` changed from the authenticated Kanban board back to a redirect without any route test in the same PR.
- `src/components/analytics/customer-journey-tab.tsx` changed the empty-state title to `No customer journey data yet`, but `src/components/analytics/analytics-section-page.test.tsx` still expected the previous wording.

## Merge blockers

- Changed route contract with no matching route test or E2E update.
- Changed shared visible copy with stale nearby assertions.
- E2E helpers still pointing at an obsolete route target.
