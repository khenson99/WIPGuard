# WIPGuard App

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
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`

Integrations:

- `HUBSPOT_CLIENT_ID`
- `HUBSPOT_CLIENT_SECRET`
- `HUBSPOT_SCOPES` (optional, comma or space-separated; requested as HubSpot `optional_scope`, defaults to `crm.objects.deals.read crm.objects.contacts.read`)

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
- `META_ACCESS_TOKEN`
- `META_AD_ACCOUNT_ID`
- `META_PAGE_ID`
- Reddit Ads (required)
- `REDDIT_CLIENT_ID`
- `REDDIT_CLIENT_SECRET`
- `REDDIT_AD_ACCOUNT_ID`
- Reddit Ads (recommended)
- `REDDIT_USER_AGENT` (defaults to `WIPGuard/1.0` when omitted)
- Webflow (required)
- `WEBFLOW_API_TOKEN`
- `WEBFLOW_SITE_ID`
- SEMrush (required)
- `SEMRUSH_API_TOKEN`
- `SEMRUSH_DOMAIN`

Important:

- Existing Reddit OAuth connections must reconnect once after this update so the new `adsread` scope is granted.

Ops:

- Run `npm run ops:ads-preflight` to validate required ad analytics environment variables.
- Follow `/Users/kylehenson/WIPGuard/docs/runbooks/ads-analytics-rollout.md` for staging/production rollout.

## OAuth callback URLs

Use these callback URLs in each provider app configuration:

- Google Workspace: `http://localhost:3000/api/integrations/callback/google-workspace`
- HubSpot: `http://localhost:3000/api/integrations/callback/hubspot`
- Slack: `http://localhost:3000/api/integrations/callback/slack`

For deployed environments, replace `http://localhost:3000` with your production `NEXTAUTH_URL`.

## Integrations included

- Google Workspace (Gmail, Drive, Calendar)
- HubSpot
- Slack
- Coda (API token-based)
