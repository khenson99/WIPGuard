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
- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `CODA_API_TOKEN` (optional, enables one-click Coda connect without pasting token)
- `INTEGRATION_TOKEN_SECRET` (recommended, encrypts stored integration tokens)

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
