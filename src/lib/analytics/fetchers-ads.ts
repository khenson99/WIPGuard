import {
  AdCampaign,
  GoogleAdsData,
  MetaAdsData,
  MetaPageData,
  RedditAdsData,
  AnalyticsTimestamp,
} from "./types";

function makeMeta(source: "live" | "cached" = "live"): AnalyticsTimestamp {
  const now = new Date();
  return {
    fetchedAt: now.toISOString(),
    nextRefresh: new Date(now.getTime() + 60 * 60 * 1000).toISOString(),
    source,
  };
}

/**
 * Fetch Google Ads data for the last 30 days
 */
export async function fetchGoogleAdsData(
  devToken: string,
  customerId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<GoogleAdsData> {
  try {
    // Step 1: Exchange refresh token for access token
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
      throw new Error(`Failed to get access token: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    // Step 2: Query Google Ads API using GAQL
    const cleanCustomerId = customerId.replace(/-/g, "");
    const gaqlQuery = `
      SELECT campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_per_conversion 
      FROM campaign 
      WHERE segments.date DURING LAST_30_DAYS AND campaign.status = 'ENABLED'
    `;

    const adsResponse = await fetch(
      `https://googleads.googleapis.com/v17/customers/${cleanCustomerId}:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: gaqlQuery,
        }),
      }
    );

    if (!adsResponse.ok) {
      throw new Error(`Google Ads API error: ${adsResponse.statusText}`);
    }

    const responseText = await adsResponse.text();
    const lines = responseText.trim().split("\n");

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;
    let totalCostPerConversion = 0;
    const campaigns: AdCampaign[] = [];
    let campaignCount = 0;

    // Parse streaming response
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const batch = JSON.parse(line) as {
          results?: Array<{
            campaign?: { name: string };
            metrics?: {
              cost_micros?: number;
              impressions?: number;
              clicks?: number;
              conversions?: number;
              cost_per_conversion?: number;
            };
          }>;
        };

        if (batch.results) {
          for (const result of batch.results) {
            const campaign = result.campaign;
            const metrics = result.metrics;

            if (campaign && metrics) {
              const spend = (metrics.cost_micros || 0) / 1_000_000;
              const impressions = metrics.impressions || 0;
              const clicks = metrics.clicks || 0;
              const conversions = metrics.conversions || 0;
              const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
              const cpc = clicks > 0 ? spend / clicks : 0;

              totalSpend += spend;
              totalImpressions += impressions;
              totalClicks += clicks;
              totalConversions += conversions;
              if (metrics.cost_per_conversion) {
                totalCostPerConversion += metrics.cost_per_conversion;
                campaignCount++;
              }

              campaigns.push({
                name: campaign.name,
                spend,
                impressions,
                clicks,
                conversions,
                ctr,
                cpc,
              });
            }
          }
        }
      } catch (e) {
        // Skip invalid lines in streaming response
      }
    }

    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
    const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;
    // Estimate ROAS: assume $500 average deal size per conversion
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
  } catch (error) {
    console.error("Error fetching Google Ads data:", error);
    // Return empty data on error
    return {
      totalSpend30d: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
      campaigns: [],
      _meta: makeMeta("live"),
    };
  }
}

/**
 * Fetch Meta Ads data for the last 30 days
 */
export async function fetchMetaAdsData(
  accessToken: string,
  adAccountId: string
): Promise<MetaAdsData> {
  try {
    // Step 1: Get account-level insights
    const insightsResponse = await fetch(
      `https://graph.facebook.com/v18.0/act_${adAccountId}/insights?fields=spend,impressions,clicks,actions&date_preset=last_30d&level=account&access_token=${accessToken}`
    );

    if (!insightsResponse.ok) {
      throw new Error(`Meta Insights API error: ${insightsResponse.statusText}`);
    }

    const insightsData = await insightsResponse.json() as {
      data?: Array<{
        spend?: string;
        impressions?: number;
        clicks?: number;
        actions?: Array<{ action_type: string; value: string }>;
      }>;
    };

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    let totalConversions = 0;

    if (insightsData.data && insightsData.data.length > 0) {
      const insight = insightsData.data[0];
      totalSpend = parseFloat(insight.spend || "0");
      totalImpressions = insight.impressions || 0;
      totalClicks = insight.clicks || 0;

      // Extract conversions from actions
      if (insight.actions) {
        for (const action of insight.actions) {
          if (
            action.action_type === "offsite_conversion" ||
            action.action_type === "lead"
          ) {
            totalConversions += parseFloat(action.value || "0");
          }
        }
      }
    }

    // Step 2: Get campaign-level data
    const campaignsResponse = await fetch(
      `https://graph.facebook.com/v18.0/act_${adAccountId}/campaigns?fields=name,insights{spend,impressions,clicks,actions}&date_preset=last_30d&access_token=${accessToken}`
    );

    if (!campaignsResponse.ok) {
      throw new Error(`Meta Campaigns API error: ${campaignsResponse.statusText}`);
    }

    const campaignsData = await campaignsResponse.json() as {
      data?: Array<{
        name?: string;
        insights?: {
          data?: Array<{
            spend?: string;
            impressions?: number;
            clicks?: number;
            actions?: Array<{ action_type: string; value: string }>;
          }>;
        };
      }>;
    };

    const campaigns: AdCampaign[] = [];

    if (campaignsData.data) {
      for (const campaign of campaignsData.data) {
        if (campaign.insights && campaign.insights.data) {
          const insight = campaign.insights.data[0];
          const spend = parseFloat(insight.spend || "0");
          const impressions = insight.impressions || 0;
          const clicks = insight.clicks || 0;

          let conversions = 0;
          if (insight.actions) {
            for (const action of insight.actions) {
              if (
                action.action_type === "offsite_conversion" ||
                action.action_type === "lead"
              ) {
                conversions += parseFloat(action.value || "0");
              }
            }
          }

          const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
          const cpc = clicks > 0 ? spend / clicks : 0;

          campaigns.push({
            name: campaign.name || "Unknown",
            spend,
            impressions,
            clicks,
            conversions,
            ctr,
            cpc,
          });
        }
      }
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
  } catch (error) {
    console.error("Error fetching Meta Ads data:", error);
    // Return empty data on error
    return {
      totalSpend30d: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      campaigns: [],
      _meta: makeMeta("live"),
    };
  }
}

/**
 * Fetch Meta Page Insights data
 */
export async function fetchMetaPageData(
  accessToken: string,
  pageId: string
): Promise<MetaPageData> {
  try {
    // Step 1: Get page likes and followers
    const pageResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}?fields=fan_count,followers_count&access_token=${accessToken}`
    );

    if (!pageResponse.ok) {
      throw new Error(`Meta Page API error: ${pageResponse.statusText}`);
    }

    const pageData = await pageResponse.json() as {
      fan_count?: number;
      followers_count?: number;
    };

    const pageLikes = pageData.fan_count || 0;
    const pageFollowers = pageData.followers_count || 0;

    // Step 2: Get reach and engagement metrics
    const insightsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/insights?metric=page_impressions,page_engaged_users&period=days_28&access_token=${accessToken}`
    );

    if (!insightsResponse.ok) {
      throw new Error(`Meta Insights API error: ${insightsResponse.statusText}`);
    }

    const insightsData = await insightsResponse.json() as {
      data?: Array<{
        name: string;
        values?: Array<{ value: number }>;
      }>;
    };

    let postReach30d = 0;
    let postEngagement30d = 0;

    if (insightsData.data) {
      for (const metric of insightsData.data) {
        if (metric.name === "page_impressions" && metric.values) {
          postReach30d = metric.values.reduce((sum, v) => sum + v.value, 0);
        }
        if (metric.name === "page_engaged_users" && metric.values) {
          postEngagement30d = metric.values.reduce((sum, v) => sum + v.value, 0);
        }
      }
    }

    // Step 3: Get top posts
    const postsResponse = await fetch(
      `https://graph.facebook.com/v18.0/${pageId}/posts?fields=message,insights{metric(post_impressions,post_engaged_users)},created_time&limit=5&access_token=${accessToken}`
    );

    if (!postsResponse.ok) {
      throw new Error(`Meta Posts API error: ${postsResponse.statusText}`);
    }

    const postsData = await postsResponse.json() as {
      data?: Array<{
        message?: string;
        created_time?: string;
        insights?: {
          data?: Array<{
            name: string;
            values?: Array<{ value: number }>;
          }>;
        };
      }>;
    };

    const topPosts: { message: string; reach: number; engagement: number; createdAt: string }[] = [];

    if (postsData.data) {
      for (const post of postsData.data) {
        let reach = 0;
        let engagement = 0;

        if (post.insights && post.insights.data) {
          for (const metric of post.insights.data) {
            if (
              metric.name === "post_impressions" &&
              metric.values &&
              metric.values.length > 0
            ) {
              reach = metric.values[0].value;
            }
            if (
              metric.name === "post_engaged_users" &&
              metric.values &&
              metric.values.length > 0
            ) {
              engagement = metric.values[0].value;
            }
          }
        }

        topPosts.push({
          message: post.message || "",
          reach,
          engagement,
          createdAt: post.created_time || new Date().toISOString(),
        });
      }
    }

    return {
      pageLikes,
      pageFollowers,
      postReach30d,
      postEngagement30d,
      topPosts,
      _meta: makeMeta("live"),
    };
  } catch (error) {
    console.error("Error fetching Meta Page data:", error);
    // Return empty data on error
    return {
      pageLikes: 0,
      pageFollowers: 0,
      postReach30d: 0,
      postEngagement30d: 0,
      topPosts: [],
      _meta: makeMeta("live"),
    };
  }
}

/**
 * Fetch Reddit Ads data for the last 30 days
 */
export async function fetchRedditAdsData(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
  adAccountId: string
): Promise<RedditAdsData> {
  try {
    // Step 1: Get access token using Basic auth
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    const tokenResponse = await fetch("https://www.reddit.com/api/v1/access_token", {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      throw new Error(`Reddit token error: ${tokenResponse.statusText}`);
    }

    const tokenData = await tokenResponse.json() as { access_token: string };
    const accessToken = tokenData.access_token;

    // Step 2: Get campaigns
    const campaignsResponse = await fetch(
      `https://ads-api.reddit.com/api/v3/ad_accounts/${adAccountId}/campaigns`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!campaignsResponse.ok) {
      throw new Error(`Reddit Campaigns API error: ${campaignsResponse.statusText}`);
    }

    const campaignsData = await campaignsResponse.json() as {
      data?: Array<{
        id: string;
        name: string;
      }>;
    };

    // Step 3: Get campaign reports
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const reportsResponse = await fetch(
      `https://ads-api.reddit.com/api/v3/ad_accounts/${adAccountId}/reports?` +
        new URLSearchParams({
          start_date: thirtyDaysAgo.toISOString().split("T")[0],
          end_date: now.toISOString().split("T")[0],
        }).toString(),
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!reportsResponse.ok) {
      throw new Error(`Reddit Reports API error: ${reportsResponse.statusText}`);
    }

    const reportsData = await reportsResponse.json() as {
      data?: Array<{
        campaign_id: string;
        spend: number;
        impressions: number;
        clicks: number;
      }>;
    };

    let totalSpend = 0;
    let totalImpressions = 0;
    let totalClicks = 0;
    const campaigns: AdCampaign[] = [];
    const campaignMap = new Map<string, typeof reportsData.data[0]>();

    // Build campaign report map
    if (reportsData.data) {
      for (const report of reportsData.data) {
        totalSpend += report.spend || 0;
        totalImpressions += report.impressions || 0;
        totalClicks += report.clicks || 0;
        campaignMap.set(report.campaign_id, report);
      }
    }

    // Build campaigns list
    if (campaignsData.data) {
      for (const campaign of campaignsData.data) {
        const report = campaignMap.get(campaign.id);
        const spend = report?.spend || 0;
        const impressions = report?.impressions || 0;
        const clicks = report?.clicks || 0;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;

        campaigns.push({
          name: campaign.name,
          spend,
          impressions,
          clicks,
          conversions: 0, // Reddit API doesn't provide conversion data easily
          ctr,
          cpc,
        });
      }
    }

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
  } catch (error) {
    console.error("Error fetching Reddit Ads data:", error);
    // Return zeros on error (user may not have Reddit Ads credentials)
    return {
      totalSpend30d: 0,
      totalImpressions: 0,
      totalClicks: 0,
      ctr: 0,
      cpc: 0,
      campaigns: [],
      _meta: makeMeta("live"),
    };
  }
}
