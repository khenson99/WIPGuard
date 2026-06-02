# Imladris

Imladris is Arda's operating-metrics platform: a governed layer for provider data, canonical metrics, trusted reports, and automation evidence.

The visible product has been reset around four workspaces:

- **Sources**: provider connections, sync health, freshness, errors, and raw source lineage.
- **Metrics**: canonical metric definitions, computed values, trust state, confidence, warnings, and source lineage.
- **Reports**: CEO, investor, weekly, and custom report packs generated from the same trusted metric values.
- **Automation Pipelines**: ingestion, metric refresh, report generation, AI artifacts, recommendations, approvals, failures, and replay.

The previous WIPGuard taskboard, Kanban, deal, conference, retention, and sprawling analytics UI surfaces have been removed from the primary app. The reset intentionally preserves the valuable backend plumbing: auth, organizations, provider OAuth, integration APIs, provider clients/fetchers, Imladris raw/canonical metric services, CEO metric/report APIs, automation runtime APIs, Prisma models, workers, and provider-focused tests.

## Local development

```bash
npm install
npm run dev
```

App URL: [http://localhost:3000](http://localhost:3000)

## Required environment variables

Core:

- `DATABASE_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Client-side tracking (GTM):

- `NEXT_PUBLIC_GTM_ID` (optional; enables Google Tag Manager in the app)
- `NEXT_PUBLIC_ANALYTICS_DEBUG` (optional; set to `1` to log `dataLayer` events in the browser console)
- Tracking helpers live in `src/lib/tracking/data-layer.ts` and push events like `page_view`, `login`, `sign_up`, and metric events.

Authentication:

- Email/password credentials auth is enabled by default.
- `INVITE_TOKEN_SECRET` (recommended; falls back to `NEXTAUTH_SECRET`)
- `PASSWORD_RESET_TOKEN_TTL_SECONDS` (optional; default `3600`)
- Google OAuth (optional):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Integrations:

- `HUBSPOT_CLIENT_ID`
- `HUBSPOT_CLIENT_SECRET`
- `HUBSPOT_SCOPES` (optional, comma or space-separated; requested as HubSpot `optional_scope`, defaults to `crm.objects.deals.read crm.objects.contacts.read`)
- `STRIPE_CLIENT_ID` (required for in-app Stripe OAuth connect)
- `STRIPE_CLIENT_SECRET` (required for in-app Stripe OAuth connect)
- `STRIPE_SCOPES` (optional, defaults to `read_write`)
- `STRIPE_SECRET_KEY` (optional fallback for server-managed Stripe analytics)

Stripe churn attribution:
- Populate the `StripeCustomerLink` table with Stripe customer IDs and HubSpot deal IDs.
- Optional: `stripe_customer_id` (preferred) or `stripe_customer` HubSpot deal properties can be used as a fallback mapping source.

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `CODA_API_TOKEN` (optional, enables one-click Coda connect without pasting token)
- `INTEGRATION_TOKEN_SECRET` (recommended, encrypts stored integration tokens)

Advertising and marketing analytics:

- Google Ads (required)
- `GOOGLE_ADS_DEVELOPER_TOKEN`
- `GOOGLE_ADS_CUSTOMER_ID`
- `GOOGLE_ADS_REFRESH_TOKEN`
- `GOOGLE_ADS_CLIENT_ID`
- `GOOGLE_ADS_CLIENT_SECRET`
- Google Ads (optional)
- `GOOGLE_ADS_LOGIN_CUSTOMER_ID` (manager account id for MCC access)
- Meta (required)
- `META_ACCESS_TOKEN` (User/System User access token; must include `ads_read` or `ads_management` and be assigned to the configured ad account; NOT an `app_id|app_secret` app token)
- `META_AD_ACCOUNT_ID`
- `META_PAGE_ID`
- Meta OAuth app config (required only if using in-app OAuth connect; also enables `debug_token` validation in `npm run ops:ads-preflight`)
- `META_APP_ID`
- `META_APP_SECRET`
- Reddit Ads (required)
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_AD_ACCOUNT_ID`
- Reddit Ads (recommended)
- `REDDIT_USER_AGENT` (defaults to `The-Mother-Node/1.0` when omitted)
- Webflow (required)
- `WEBFLOW_API_TOKEN`
- `WEBFLOW_SITE_ID`
- Google Search Console (required for organic search telemetry)
- `GOOGLE_SEARCH_CONSOLE_SITE_URL`
- `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN` or Google service-account/OAuth credentials already used for Google analytics access
- SEMrush (required)
- `SEMRUSH_API_TOKEN`
- `SEMRUSH_DOMAIN`

Important:

- Existing Reddit OAuth connections must reconnect once after this update so the new `adsread` scope is granted.

Ops:

- Run `npm run ops:ads-preflight` to validate required ad analytics environment variables.
- Follow `docs/runbooks/ads-analytics-rollout.md` for staging/production rollout.

## OAuth callback URLs

Use these callback URLs in each provider app configuration:

- Google Workspace: `http://localhost:3000/api/integrations/callback/google-workspace`
- HubSpot: `http://localhost:3000/api/integrations/callback/hubspot`
- Slack: `http://localhost:3000/api/integrations/callback/slack`
- Stripe: `http://localhost:3000/api/integrations/callback/stripe`

For deployed environments, replace `http://localhost:3000` with your production `NEXTAUTH_URL`.

## Authentication flows

- Standard login supports email/password and (optionally) Google OAuth.
- Credentials onboarding is invite-only:
  - Admins create an invite link from Team settings.
  - Invitees open `/login?inviteToken=...` and set their password.
- Password resets are admin-generated links from Team settings:
  - Admin creates a reset link for an existing user.
  - User opens `/login?resetToken=...` and sets a new password.

## Integrations included

- Google Workspace (Gmail, Drive, Calendar)
- HubSpot
- Slack
- Coda (API token-based)

## Visitor funnel enrichment

Imladris can normalize website-visitor enrichment signals from:

- Unify via scheduled pull
- Clay via webhook push
- RB2B via webhook push

The shared ingestion endpoint pattern is:

- `/api/v1/analytics/funnel/enrich/unify`
- `/api/v1/analytics/funnel/enrich/clay`
- `/api/v1/analytics/funnel/enrich/rb2b`

Configuration lives in [`.env.example`](./.env.example) under `Visitor Funnel Enrichment`.

Setup and payload examples:

- [`docs/runbooks/visitor-funnel-enrichment.md`](./docs/runbooks/visitor-funnel-enrichment.md)
