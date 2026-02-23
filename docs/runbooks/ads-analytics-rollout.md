# Runbook: Ads Analytics Reliability Rollout

## Trigger
- Deploying the ad integration reliability fix across Google Ads, Meta Ads/Page, Reddit Ads, Webflow, and SEMrush.

## Preconditions
1. App build from the updated branch is deployed to the target environment.
2. Environment variables are available in the target runtime.
3. Existing Reddit OAuth users are informed they must reconnect once for `adsread`.

## Step 1: Env Preflight
1. Run:
   - `npm run ops:ads-preflight`
2. If the check fails, set the missing keys:
   - `GOOGLE_ADS_DEVELOPER_TOKEN`
   - `GOOGLE_ADS_CUSTOMER_ID`
   - `GOOGLE_ADS_REFRESH_TOKEN`
   - `GOOGLE_ADS_CLIENT_ID`
   - `GOOGLE_ADS_CLIENT_SECRET`
   - `META_ACCESS_TOKEN`
   - `META_AD_ACCOUNT_ID`
   - `META_PAGE_ID`
   - Notes for Meta:
     - `META_ACCESS_TOKEN` must be a User/System User token with `ads_read` or `ads_management` and access to `META_AD_ACCOUNT_ID` (not an `app_id|app_secret` app token).
     - If `META_APP_ID` and `META_APP_SECRET` are present, the preflight will use `debug_token` for more reliable scope validation.
   - `REDDIT_CLIENT_ID`
   - `REDDIT_CLIENT_SECRET`
   - `REDDIT_AD_ACCOUNT_ID`
   - `REDDIT_USER_AGENT`
   - `WEBFLOW_API_TOKEN`
   - `WEBFLOW_SITE_ID`
   - `SEMRUSH_API_TOKEN`
   - `SEMRUSH_DOMAIN`
3. Optional:
   - `GOOGLE_ADS_LOGIN_CUSTOMER_ID`

## Step 2: Deploy
1. Deploy the current revision to staging.
2. Validate staging analytics endpoints and UI behavior.
3. Deploy to production.

## Step 3: Google OAuth Scope Backfill
1. Run once (with `DATABASE_URL` set):
   - `npm run ops:backfill-google-oauth-scopes`
2. Trigger an analytics refresh / provider sync to generate a fresh Google Ads snapshot.

## Step 4: Reddit Reconnect
1. Reconnect existing Reddit integrations through Settings.
2. Confirm re-consent includes `adsread`.
3. Validate Reddit Ads card no longer returns scope errors.

## Step 5: Smoke Tests
1. Open Analytics and verify each provider card can show:
   - Not configured
   - Configured but failing
   - No data in selected range
   - Healthy
2. Verify Google Ads works with and without `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.
3. Verify SEMrush loads metrics for `SEMRUSH_DOMAIN` (not hardcoded values).
4. Verify Reddit campaign metrics populate from v3 report responses.

## Step 6: Post-Deploy Monitoring (24h)
1. Watch for spikes in `analyticsData.errors`.
2. Watch stale snapshot growth in ads-related domains.
3. Confirm failure messages are actionable (not silent zero payloads).

## Rollback
1. Revert to previous stable release.
2. Keep env vars in place for faster reattempt.
3. Re-run this runbook after patch validation.
