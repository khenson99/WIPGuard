import {
  AdCampaign,
  GoogleAdsData,
  MetaAdsData,
  MetaPageData,
  RedditAdsData,
  AnalyticsTimestamp,
} from "./types";

type UnknownRecord = Record<string, unknown>;

const META_GRAPH_VERSION = "v21.0";

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

function asRecord(value: unknown): UnknownRecord | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as UnknownRecord;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

async function parseErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  return text ? text.slice(0, 500) : response.statusText || "Unknown error";
}

function normalizeBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}

function normalizeMetaAdAccountId(adAccountId: string): string {
  return adAccountId.trim().replace(/^act_/i, "");
}

function looksLikeMetaAppAccessToken(accessToken: string): boolean {
  const normalized = accessToken.trim();
  return Boolean(normalized && /^\d+\|/.test(normalized));
}

function extractMetaConversions(actions: unknown): number {
  let total = 0;
  for (const actionRaw of asArray(actions)) {
    const action = asRecord(actionRaw);
    if (!action) continue;
    const actionType = String(action.action_type ?? "").toLowerCase();
    if (
      actionType === "lead" ||
      actionType.includes("lead") ||
      actionType.startsWith("offsite_conversion")
    ) {
      total += readNumber(action.value);
    }
  }
  return total;
}

function parseGoogleAdsBatches(raw: string): { batches: UnknownRecord[]; parsed: boolean } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { batches: [], parsed: true };
  }

  const batches: UnknownRecord[] = [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      for (const item of parsed) {
        const record = asRecord(item);
        if (record) batches.push(record);
      }
      return { batches, parsed: true };
    }
    const record = asRecord(parsed);
    if (record) {
      batches.push(record);
      return { batches, parsed: true };
    }
    return { batches, parsed: true };
  } catch {
    // Fall back to line-delimited parsing below.
  }

  let parsedLineCount = 0;
  for (const line of trimmed.split("\n")) {
    const lineTrimmed = line.trim();
    if (!lineTrimmed) continue;
    try {
      const parsedLine = JSON.parse(lineTrimmed);
      parsedLineCount += 1;
      if (Array.isArray(parsedLine)) {
        for (const item of parsedLine) {
          const record = asRecord(item);
          if (record) batches.push(record);
        }
        continue;
      }
      const record = asRecord(parsedLine);
      if (record) {
        batches.push(record);
      }
    } catch {
      // Ignore non-JSON lines from chunked responses.
    }
  }

  return { batches, parsed: parsedLineCount > 0 };
}

function extractRedditCampaignId(metric: UnknownRecord): string | null {
  const candidate =
    metric.campaign_id ??
    metric.campaignId ??
    metric.CAMPAIGN_ID ??
    metric.campaign ??
    null;
  if (!candidate) return null;
  const id = String(candidate).trim();
  return id || null;
}

function extractRedditSpend(metric: UnknownRecord): number {
  const direct =
    metric.spend ??
    metric.SPEND ??
    metric.amount_spent ??
    metric.total_spend ??
    null;
  if (direct !== null) {
    return readNumber(direct);
  }

  const micros =
    metric.spend_micros ??
    metric.spendMicros ??
    metric.amount_spent_micros ??
    metric.total_spend_micros ??
    null;
  if (micros !== null) {
    return readNumber(micros) / 1_000_000;
  }

  return 0;
}

/**
 * Fetch Google Ads data for the last 30 days.
 */
export async function fetchGoogleAdsData(
  devToken: string,
  customerId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  loginCustomerId?: string | null
): Promise<GoogleAdsData> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Failed to get Google access token (${tokenResponse.status}): ${await parseErrorBody(tokenResponse)}`
    );
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  const accessToken = tokenData.access_token?.trim();
  if (!accessToken) {
    throw new Error("Google token response did not include access_token.");
  }

  const cleanCustomerId = customerId.replace(/-/g, "").trim();
  const cleanLoginCustomerId = loginCustomerId?.replace(/-/g, "").trim();
  const gaqlQuery = `
    SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
  `;

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": devToken,
    "Content-Type": "application/json",
  };
  if (cleanLoginCustomerId) {
    headers["login-customer-id"] = cleanLoginCustomerId;
  }

  const adsResponse = await fetch(
    `https://googleads.googleapis.com/v21/customers/${cleanCustomerId}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query: gaqlQuery }),
    }
  );

  if (!adsResponse.ok) {
    throw new Error(
      `Google Ads API error (${adsResponse.status}): ${await parseErrorBody(adsResponse)}`
    );
  }

  const responseText = await adsResponse.text();
  const { batches, parsed } = parseGoogleAdsBatches(responseText);
  if (!parsed) {
    throw new Error(
      `Google Ads response parse error: ${responseText.slice(0, 300) || "unparseable response body"}`
    );
  }

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  const campaigns: AdCampaign[] = [];

  for (const batch of batches) {
    for (const resultRaw of asArray(batch.results)) {
      const result = asRecord(resultRaw);
      if (!result) continue;
      const campaign = asRecord(result.campaign);
      const metrics = asRecord(result.metrics);
      if (!metrics) continue;

      const spend = readNumber(metrics.cost_micros) / 1_000_000;
      const impressions = readNumber(metrics.impressions);
      const clicks = readNumber(metrics.clicks);
      const conversions = readNumber(metrics.conversions);
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const cpc = clicks > 0 ? spend / clicks : 0;

      totalSpend += spend;
      totalImpressions += impressions;
      totalClicks += clicks;
      totalConversions += conversions;

      campaigns.push({
        name: String(campaign?.name ?? "Unknown campaign"),
        spend,
        impressions,
        clicks,
        conversions,
        ctr,
        cpc,
      });
    }
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
  const estimatedRevenue = totalConversions * 500;
  const roas = totalSpend > 0 ? estimatedRevenue / totalSpend : 0;

  return {
    totalSpend30d: totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    ctr,
    cpc,
    cpa,
    roas,
    campaigns,
    _meta: makeMeta("live"),
  };
}

/**
 * Fetch Meta Ads data for the last 30 days.
 */
export async function fetchMetaAdsData(
  accessToken: string,
  adAccountId: string
): Promise<MetaAdsData> {
  const token = normalizeBearerToken(accessToken);
  if (looksLikeMetaAppAccessToken(token)) {
    throw new Error(
      "Meta Ads token error: META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). WIPGuard requires a User/System User token with ads_read or ads_management and access to the configured ad account."
    );
  }

  const accountId = normalizeMetaAdAccountId(adAccountId);
  const baseHeaders = { Authorization: `Bearer ${token}` };

  const insightsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/insights`
  );
  insightsUrl.searchParams.set("fields", "spend,impressions,clicks,actions");
  insightsUrl.searchParams.set("date_preset", "last_30d");
  insightsUrl.searchParams.set("level", "account");

  const insightsResponse = await fetch(insightsUrl, { headers: baseHeaders });
  if (!insightsResponse.ok) {
    throw new Error(
      `Meta Ads insights error (${insightsResponse.status}): ${await parseErrorBody(insightsResponse)}`
    );
  }

  const insightsData = (await insightsResponse.json()) as {
    data?: Array<{
      spend?: string | number;
      impressions?: string | number;
      clicks?: string | number;
      actions?: Array<{ action_type?: string; value?: string | number }>;
    }>;
  };

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;

  const accountInsight = insightsData.data?.[0];
  if (accountInsight) {
    totalSpend = readNumber(accountInsight.spend);
    totalImpressions = readNumber(accountInsight.impressions);
    totalClicks = readNumber(accountInsight.clicks);
    totalConversions = extractMetaConversions(accountInsight.actions);
  }

  const campaignsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/campaigns`
  );
  campaignsUrl.searchParams.set("fields", "name,insights{spend,impressions,clicks,actions}");
  campaignsUrl.searchParams.set("date_preset", "last_30d");

  const campaignsResponse = await fetch(campaignsUrl, { headers: baseHeaders });
  if (!campaignsResponse.ok) {
    throw new Error(
      `Meta Ads campaigns error (${campaignsResponse.status}): ${await parseErrorBody(campaignsResponse)}`
    );
  }

  const campaignsData = (await campaignsResponse.json()) as {
    data?: Array<{
      name?: string;
      insights?: {
        data?: Array<{
          spend?: string | number;
          impressions?: string | number;
          clicks?: string | number;
          actions?: Array<{ action_type?: string; value?: string | number }>;
        }>;
      };
    }>;
  };

  const campaigns: AdCampaign[] = [];
  for (const campaign of campaignsData.data ?? []) {
    const insight = campaign.insights?.data?.[0];
    if (!insight) continue;

    const spend = readNumber(insight.spend);
    const impressions = readNumber(insight.impressions);
    const clicks = readNumber(insight.clicks);
    const conversions = extractMetaConversions(insight.actions);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;

    campaigns.push({
      name: campaign.name || "Unknown campaign",
      spend,
      impressions,
      clicks,
      conversions,
      ctr,
      cpc,
    });
  }

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  return {
    totalSpend30d: totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    ctr,
    cpc,
    cpa,
    campaigns,
    _meta: makeMeta("live"),
  };
}

/**
 * Fetch Meta Page Insights data.
 */
export async function fetchMetaPageData(
  accessToken: string,
  pageId: string
): Promise<MetaPageData> {
  const token = normalizeBearerToken(accessToken);
  if (looksLikeMetaAppAccessToken(token)) {
    throw new Error(
      "Meta Page token error: META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). WIPGuard requires a User/System User token with ads_read or ads_management and access to the configured Page."
    );
  }

  const baseHeaders = { Authorization: `Bearer ${token}` };
  const normalizedPageId = pageId.trim();

  const pageUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${normalizedPageId}`
  );
  pageUrl.searchParams.set("fields", "fan_count,followers_count");

  const pageResponse = await fetch(pageUrl, { headers: baseHeaders });
  if (!pageResponse.ok) {
    throw new Error(
      `Meta Page profile error (${pageResponse.status}): ${await parseErrorBody(pageResponse)}`
    );
  }
  const pageData = (await pageResponse.json()) as {
    fan_count?: string | number;
    followers_count?: string | number;
  };

  const pageLikes = readNumber(pageData.fan_count);
  const pageFollowers = readNumber(pageData.followers_count);

  const insightsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${normalizedPageId}/insights`
  );
  insightsUrl.searchParams.set("metric", "page_impressions,page_engaged_users");
  insightsUrl.searchParams.set("period", "days_28");

  const insightsResponse = await fetch(insightsUrl, { headers: baseHeaders });
  if (!insightsResponse.ok) {
    throw new Error(
      `Meta Page insights error (${insightsResponse.status}): ${await parseErrorBody(insightsResponse)}`
    );
  }
  const insightsData = (await insightsResponse.json()) as {
    data?: Array<{
      name: string;
      values?: Array<{ value: string | number }>;
    }>;
  };

  let postReach30d = 0;
  let postEngagement30d = 0;
  for (const metric of insightsData.data ?? []) {
    const value = (metric.values ?? []).reduce((sum, item) => sum + readNumber(item.value), 0);
    if (metric.name === "page_impressions") {
      postReach30d = value;
    }
    if (metric.name === "page_engaged_users") {
      postEngagement30d = value;
    }
  }

  const postsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${normalizedPageId}/posts`
  );
  postsUrl.searchParams.set(
    "fields",
    "message,insights{metric(post_impressions,post_engaged_users)},created_time"
  );
  postsUrl.searchParams.set("limit", "5");

  const postsResponse = await fetch(postsUrl, { headers: baseHeaders });
  if (!postsResponse.ok) {
    throw new Error(
      `Meta Page posts error (${postsResponse.status}): ${await parseErrorBody(postsResponse)}`
    );
  }

  const postsData = (await postsResponse.json()) as {
    data?: Array<{
      message?: string;
      created_time?: string;
      insights?: {
        data?: Array<{
          name: string;
          values?: Array<{ value: string | number }>;
        }>;
      };
    }>;
  };

  const topPosts: { message: string; reach: number; engagement: number; createdAt: string }[] = [];
  for (const post of postsData.data ?? []) {
    let reach = 0;
    let engagement = 0;
    for (const metric of post.insights?.data ?? []) {
      const metricValue = readNumber(metric.values?.[0]?.value);
      if (metric.name === "post_impressions") {
        reach = metricValue;
      }
      if (metric.name === "post_engaged_users") {
        engagement = metricValue;
      }
    }

    topPosts.push({
      message: post.message || "",
      reach,
      engagement,
      createdAt: post.created_time || new Date().toISOString(),
    });
  }

  return {
    pageLikes,
    pageFollowers,
    postReach30d,
    postEngagement30d,
    topPosts,
    _meta: makeMeta("live"),
  };
}

export async function fetchMetaInstagramData(
  accessToken: string,
  instagramAccountId: string,
  options?: { pageId?: string }
): Promise<Record<string, unknown>> {
  const token = normalizeBearerToken(accessToken);
  if (looksLikeMetaAppAccessToken(token)) {
    throw new Error(
      "Meta Instagram token error: META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). WIPGuard requires a User/System User token with ads_read or ads_management and access to the configured Instagram account."
    );
  }

  const baseHeaders = { Authorization: `Bearer ${token}` };
  const accountId = instagramAccountId.trim();

  const accountUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}`);
  accountUrl.searchParams.set("fields", "id,username,followers_count,media_count");

  const accountResponse = await fetch(accountUrl, { headers: baseHeaders });
  if (!accountResponse.ok) {
    throw new Error(
      `Meta Instagram profile error (${accountResponse.status}): ${await parseErrorBody(accountResponse)}`
    );
  }

  const accountData = (await accountResponse.json()) as {
    id?: string;
    username?: string;
    followers_count?: string | number;
    media_count?: string | number;
  };

  const mediaUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}/media`);
  mediaUrl.searchParams.set("fields", "id,caption,timestamp,like_count,comments_count");
  mediaUrl.searchParams.set("limit", "25");

  const mediaResponse = await fetch(mediaUrl, { headers: baseHeaders });
  if (!mediaResponse.ok) {
    throw new Error(
      `Meta Instagram media error (${mediaResponse.status}): ${await parseErrorBody(mediaResponse)}`
    );
  }

  const mediaData = (await mediaResponse.json()) as {
    data?: Array<{
      id?: string;
      caption?: string;
      timestamp?: string;
      like_count?: string | number;
      comments_count?: string | number;
    }>;
  };

  const media = (mediaData.data ?? []).map((item) => ({
    id: item.id ?? "",
    caption: item.caption ?? "",
    timestamp: item.timestamp ?? "",
    likes: readNumber(item.like_count),
    comments: readNumber(item.comments_count),
  }));

  const engagement30d = media.reduce((sum, item) => sum + item.likes + item.comments, 0);

  return {
    accountId: accountData.id ?? accountId,
    username: accountData.username ?? null,
    followers: readNumber(accountData.followers_count),
    mediaCount: readNumber(accountData.media_count),
    engagement30d,
    linkedPageId: options?.pageId ?? null,
    media,
    _meta: makeMeta("live"),
  };
}

/**
 * Fetch Reddit Ads data for the last 30 days using v3 endpoints.
 */
export async function fetchRedditAdsData(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  adAccountId: string,
  userAgent?: string | null
): Promise<RedditAdsData> {
  const normalizedUserAgent = (userAgent || process.env.REDDIT_USER_AGENT || "WIPGuard/1.0").trim();
  const baseHeaders = {
    "User-Agent": normalizedUserAgent,
  };

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      ...baseHeaders,
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!tokenResponse.ok) {
    throw new Error(
      `Reddit token error (${tokenResponse.status}): ${await parseErrorBody(tokenResponse)}`
    );
  }

  const tokenData = (await tokenResponse.json()) as { access_token?: string };
  const accessToken = tokenData.access_token?.trim();
  if (!accessToken) {
    throw new Error("Reddit token response did not include access_token.");
  }

  const cleanAccountId = adAccountId.trim();
  const campaignResponse = await fetch(
    `https://ads-api.reddit.com/api/v3/ad_accounts/${cleanAccountId}/campaigns`,
    {
      method: "GET",
      headers: {
        ...baseHeaders,
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!campaignResponse.ok) {
    throw new Error(
      `Reddit campaigns error (${campaignResponse.status}): ${await parseErrorBody(campaignResponse)}`
    );
  }

  const campaignsPayload = (await campaignResponse.json()) as {
    data?: Array<{ id?: string; name?: string }>;
  };
  const campaignNameById = new Map<string, string>();
  for (const campaign of campaignsPayload.data ?? []) {
    const id = String(campaign.id ?? "").trim();
    if (!id) continue;
    campaignNameById.set(id, campaign.name || id);
  }

  const now = new Date();
  const startsAt = new Date(now);
  startsAt.setUTCDate(startsAt.getUTCDate() - 29);
  startsAt.setUTCHours(0, 0, 0, 0);
  const startsAtIso = startsAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const endsAt = new Date(now);
  endsAt.setUTCMinutes(0, 0, 0);
  const endsAtIso = endsAt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const reportsResponse = await fetch(
    `https://ads-api.reddit.com/api/v3/ad_accounts/${cleanAccountId}/reports`,
    {
      method: "POST",
      headers: {
        ...baseHeaders,
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        data: {
          starts_at: startsAtIso,
          ends_at: endsAtIso,
          breakdowns: ["CAMPAIGN_ID"],
          fields: ["CAMPAIGN_ID", "SPEND", "IMPRESSIONS", "CLICKS"],
        },
      }),
    }
  );

  if (!reportsResponse.ok) {
    throw new Error(
      `Reddit reports error (${reportsResponse.status}): ${await parseErrorBody(
        reportsResponse
      )}. starts_at=${startsAtIso} ends_at=${endsAtIso}`
    );
  }

  const reportsPayload = (await reportsResponse.json()) as {
    data?: {
      metrics?: UnknownRecord[];
    };
  };

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  const campaignRollup = new Map<string, { spend: number; impressions: number; clicks: number }>();

  for (const metricRaw of reportsPayload.data?.metrics ?? []) {
    const metric = asRecord(metricRaw);
    if (!metric) continue;
    const campaignId = extractRedditCampaignId(metric) || "unknown";
    const spend = extractRedditSpend(metric);
    const impressions = readNumber(metric.impressions ?? metric.IMPRESSIONS);
    const clicks = readNumber(metric.clicks ?? metric.CLICKS);

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;

    const existing = campaignRollup.get(campaignId) ?? { spend: 0, impressions: 0, clicks: 0 };
    existing.spend += spend;
    existing.impressions += impressions;
    existing.clicks += clicks;
    campaignRollup.set(campaignId, existing);
  }

  const campaigns: AdCampaign[] = Array.from(campaignRollup.entries()).map(([campaignId, data]) => {
    const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
    const cpc = data.clicks > 0 ? data.spend / data.clicks : 0;
    return {
      name: campaignNameById.get(campaignId) || campaignId,
      spend: data.spend,
      impressions: data.impressions,
      clicks: data.clicks,
      conversions: 0,
      ctr,
      cpc,
    };
  });

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;

  return {
    totalSpend30d: totalSpend,
    totalImpressions,
    totalClicks,
    ctr,
    cpc,
    campaigns,
    _meta: makeMeta("live"),
  };
}
