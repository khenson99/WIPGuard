import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MarketingTabNew } from "@/components/analytics/marketing-tab-new";
import { createEmptyAnalyticsDashboardData } from "@/lib/analytics/response-shape";

function makeData() {
  return createEmptyAnalyticsDashboardData({
    freshness: {},
    timeRange: {
      preset: "30d",
      from: "2026-01-01",
      to: "2026-01-30",
      days: 30,
      label: "Last 30 days",
    },
  });
}

describe("MarketingTabNew provider states", () => {
  it("renders configured-but-failing when provider error exists", () => {
    const data = makeData();
    data.errors.push({ source: "googleAds", message: "Google Ads API quota exceeded" });

    render(<MarketingTabNew data={data} />);

    expect(screen.getAllByText("Configured but failing").length).toBeGreaterThan(0);
    expect(screen.getByText("Configured but failing: Google Ads API quota exceeded")).toBeTruthy();
  });

  it("renders not configured when payload is absent and there is no provider error", () => {
    const data = makeData();

    render(<MarketingTabNew data={data} />);

    expect(screen.getAllByText("Not configured").length).toBeGreaterThan(0);
    expect(screen.queryByText("Configured but failing")).toBeNull();
    expect(screen.queryByText("No Google Ads data in selected range")).toBeNull();
  });

  it("renders no-data state for healthy zero-signal payloads", () => {
    const data = makeData();
    data.googleAds = {
      totalSpend30d: 0,
      totalImpressions: 0,
      totalClicks: 0,
      totalConversions: 0,
      ctr: 0,
      cpc: 0,
      cpa: 0,
      roas: 0,
      campaigns: [],
      _meta: {
        fetchedAt: "2026-01-30T00:00:00.000Z",
        nextRefresh: "2026-01-30T01:00:00.000Z",
        source: "live",
      },
    };

    render(<MarketingTabNew data={data} />);

    expect(screen.getByText("No Google Ads data in selected range")).toBeTruthy();
  });

  it("renders Instagram creative-analysis coverage and sampled note", () => {
    const data = makeData();
    data.instagram = {
      followers: 1200,
      reach30d: 500,
      engagement30d: 90,
      traffic: 0,
      bounceRate: 0,
      clicks: 0,
      returningVisitors: 0,
      topPosts: [
        {
          id: "ig-post-1",
          message: "How are you handling replenishment?",
          reach: 90,
          engagement: 90,
          createdAt: "2026-01-15T12:00:00.000Z",
          mediaType: "VIDEO",
          mediaProductType: "REELS",
          permalink: null,
          thumbnailUrl: null,
          likeCount: 80,
          commentCount: 10,
          performanceScore: 1.82,
          engagementRate: 7.5,
          ageInDays: 4.5,
          engagementVelocity: 20,
          captionLength: 36,
          hashtagCount: 0,
          mentionCount: 0,
          emojiCount: 0,
          hasQuestionHook: true,
          hasCallToAction: false,
          postedTimeBucket: "morning",
          isVideo: true,
          isReel: true,
          isCarousel: false,
          creativeSummary: "Founder on camera with bold text overlay.",
          hasPersonVisible: true,
          hasTextOverlayVisible: true,
          looksLikeShopFloor: false,
          looksLikeProductDemo: false,
          looksEducational: true,
          looksPromotional: false,
          performanceDrivers: [
            {
              key: "hasPersonVisible",
              label: "Person visible in creative",
              source: "ai_visual",
              sampled: true,
              confidence: "medium",
              liftPct: 50,
            },
            {
              key: "hasQuestionHook",
              label: "Question-led hooks",
              source: "metadata",
              sampled: false,
              confidence: "high",
              liftPct: 22,
            },
          ],
          nextTests: [
            {
              key: "hasCallToAction",
              label: "Clear CTA language",
              action: "add",
              source: "metadata",
              sampled: false,
              confidence: "high",
              estimatedImpactPct: 18,
            },
            {
              key: "hasHashtags",
              label: "Hashtags",
              action: "reduce",
              source: "metadata",
              sampled: false,
              confidence: "high",
              estimatedImpactPct: 20,
            },
          ],
        },
      ],
      topVideos: [
        {
          id: "ig-post-1",
          message: "How are you handling replenishment?",
          reach: 90,
          engagement: 90,
          createdAt: "2026-01-15T12:00:00.000Z",
          mediaType: "VIDEO",
          mediaProductType: "REELS",
          permalink: null,
          thumbnailUrl: null,
          likeCount: 80,
          commentCount: 10,
          performanceScore: 1.82,
          engagementRate: 7.5,
          ageInDays: 4.5,
          engagementVelocity: 20,
          captionLength: 36,
          hashtagCount: 0,
          mentionCount: 0,
          emojiCount: 0,
          hasQuestionHook: true,
          hasCallToAction: false,
          postedTimeBucket: "morning",
          isVideo: true,
          isReel: true,
          isCarousel: false,
          creativeSummary: "Founder on camera with bold text overlay.",
          hasPersonVisible: true,
          hasTextOverlayVisible: true,
          looksLikeShopFloor: false,
          looksLikeProductDemo: false,
          looksEducational: true,
          looksPromotional: false,
          performanceDrivers: [
            {
              key: "hasPersonVisible",
              label: "Person visible in creative",
              source: "ai_visual",
              sampled: true,
              confidence: "medium",
              liftPct: 50,
            },
            {
              key: "hasQuestionHook",
              label: "Question-led hooks",
              source: "metadata",
              sampled: false,
              confidence: "high",
              liftPct: 22,
            },
          ],
          nextTests: [
            {
              key: "hasCallToAction",
              label: "Clear CTA language",
              action: "add",
              source: "metadata",
              sampled: false,
              confidence: "high",
              estimatedImpactPct: 18,
            },
            {
              key: "hasHashtags",
              label: "Hashtags",
              action: "reduce",
              source: "metadata",
              sampled: false,
              confidence: "high",
              estimatedImpactPct: 20,
            },
          ],
        },
      ],
      videosToImprove: [
        {
          id: "ig-post-2",
          message: "Warehouse update from this week",
          reach: 24,
          engagement: 24,
          createdAt: "2026-01-19T12:00:00.000Z",
          mediaType: "VIDEO",
          mediaProductType: "REELS",
          permalink: null,
          thumbnailUrl: null,
          likeCount: 20,
          commentCount: 4,
          performanceScore: 0.64,
          engagementRate: 2,
          ageInDays: 5.5,
          engagementVelocity: 4.4,
          captionLength: 27,
          hashtagCount: 2,
          mentionCount: 0,
          emojiCount: 0,
          hasQuestionHook: false,
          hasCallToAction: false,
          postedTimeBucket: "afternoon",
          isVideo: true,
          isReel: true,
          isCarousel: false,
          nextTests: [
            {
              key: "hasQuestionHook",
              label: "Question-led hooks",
              action: "add",
              source: "metadata",
              sampled: false,
              confidence: "high",
              estimatedImpactPct: 22,
            },
            {
              key: "hasHashtags",
              label: "Hashtags",
              action: "reduce",
              source: "metadata",
              sampled: false,
              confidence: "high",
              estimatedImpactPct: 20,
            },
          ],
        },
      ],
      mediaTypeBreakdown: {
        image: 0,
        video: 0,
        reel: 1,
        carousel: 0,
        other: 0,
      },
      creativeAnalysis: {
        analyzedVideos: 3,
        totalVideoCandidates: 8,
        sampled: true,
      },
      opportunities: [
        {
          key: "hasCallToAction",
          label: "Clear CTA language",
          source: "metadata",
          sampled: false,
          confidence: "high",
          estimatedImpactPct: 18,
          adoptionPct: 25,
        },
        {
          key: "hasPersonVisible",
          label: "Person visible in creative",
          source: "ai_visual",
          sampled: true,
          confidence: "medium",
          estimatedImpactPct: 50,
          adoptionPct: 33,
        },
      ],
      experimentPlan: [
        {
          key: "add:hasCallToAction",
          title: "Test adding clear cta language",
          brief: "Create follow-up variants that introduce clear cta language in otherwise similar videos.",
          action: "add",
          source: "metadata",
          sampled: false,
          confidence: "high",
          estimatedImpactPct: 18,
          supportingVideos: 2,
          exampleVideos: ["How are you handling replenishment?"],
        },
      ],
      testBacklog: [
        {
          key: "hasCallToAction",
          label: "Clear CTA language",
          action: "add",
          source: "metadata",
          sampled: false,
          confidence: "high",
          estimatedImpactPct: 18,
          supportingVideos: 2,
        },
        {
          key: "hasHashtags",
          label: "Hashtags",
          action: "reduce",
          source: "metadata",
          sampled: false,
          confidence: "high",
          estimatedImpactPct: 20,
          supportingVideos: 2,
        },
      ],
      attributeCorrelations: [
        {
          key: "hasPersonVisible",
          label: "Person visible in creative",
          source: "ai_visual",
          correlation: 0.42,
          sampleSize: 3,
          comparisonSampleSize: 3,
          eligiblePostCount: 6,
          coveragePct: 75,
          trueAvgEngagement: 120,
          falseAvgEngagement: 80,
          liftPct: 50,
          sampled: true,
          confidence: "medium",
          confidenceScore: 68,
          interpretation: "Person visible in creative correlate with higher normalized performance (+50% vs. posts without that attribute).",
        },
      ],
      winningPatterns: [
        {
          title: "Person visible in creative",
          detail: "Person visible in creative are associated with 50% stronger normalized performance on average (medium confidence).",
          source: "ai_visual",
          sampled: true,
          confidence: "medium",
        },
      ],
      losingPatterns: [
        {
          title: "Hashtags",
          detail: "Hashtags are associated with 20% weaker normalized performance on average (high confidence).",
          source: "metadata",
          sampled: false,
          confidence: "high",
        },
      ],
      _meta: {
        fetchedAt: "2026-01-30T00:00:00.000Z",
        nextRefresh: "2026-01-30T01:00:00.000Z",
        source: "live",
      },
    };

    render(<MarketingTabNew data={data} />);

    expect(
      screen.getByText(
        "Ranked by normalized performance across engagement rate, engagement velocity, and raw engagement in the selected window."
      )
    ).toBeTruthy();
    expect(screen.getByText("Experiment Plan")).toBeTruthy();
    expect(screen.getByText("Test adding clear cta language · high confidence")).toBeTruthy();
    expect(
      screen.getByText(
        "Create follow-up variants that introduce clear cta language in otherwise similar videos. Expected impact ~18% across 2 top videos."
      )
    ).toBeTruthy();
    expect(screen.getByText("Examples: How are you handling replenishment?")).toBeTruthy();
    expect(screen.getByText("Underused Opportunities")).toBeTruthy();
    expect(
      screen.getByText("Clear CTA language is only showing up in 25% of eligible posts (~18% upside, high confidence)")
    ).toBeTruthy();
    expect(
      screen.getByText("Person visible in creative is only showing up in 33% of eligible posts (~50% upside, medium confidence, sampled)")
    ).toBeTruthy();
    expect(screen.getByText("Recommended Tests")).toBeTruthy();
    expect(
      screen.getByText("Add clear cta language across 2 top videos (~18% impact, high confidence)")
    ).toBeTruthy();
    expect(
      screen.getByText("Reduce hashtags across 2 top videos (~20% impact, high confidence)")
    ).toBeTruthy();
    expect(screen.getByText("AI creative analysis coverage: 3 of 8 eligible videos analyzed in this pass.")).toBeTruthy();
    expect(
      screen.getByText("AI visual signals are based on a top-video sample, not the full Instagram post set.")
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Correlations use the same normalized Instagram performance score rather than raw lifetime engagement alone."
      )
    ).toBeTruthy();
    expect(screen.getByText("Winning Patterns")).toBeTruthy();
    expect(
      screen.getByText(
        "Person visible in creative are associated with 50% stronger normalized performance on average (medium confidence)."
      )
    ).toBeTruthy();
    expect(screen.getByText("Underperforming Patterns")).toBeTruthy();
    expect(
      screen.getByText("Hashtags are associated with 20% weaker normalized performance on average (high confidence).")
    ).toBeTruthy();
    expect(screen.getAllByText("Person visible in creative · AI visual · sampled · medium confidence").length).toBe(2);
    expect(screen.getByText("Reel · Score 1.82x baseline · 90 engagement")).toBeTruthy();
    expect(screen.getByText("7.50% engagement rate · 20.0/day · 4.5 days old")).toBeTruthy();
    expect(
      screen.getByText(
        "Why this is likely working: Person visible in creative (+50%, medium confidence, sampled) · Question-led hooks (+22%, high confidence)"
      )
    ).toBeTruthy();
    expect(
      screen.getByText(
        "What to test next: Add clear cta language (~18% impact, high confidence) · Reduce hashtags (~20% impact, high confidence)"
      )
    ).toBeTruthy();
    expect(screen.getByText("Videos To Improve")).toBeTruthy();
    expect(screen.getByText("Warehouse update from this week")).toBeTruthy();
    expect(screen.getByText("Reel · Score 0.64x baseline · 24 engagement")).toBeTruthy();
    expect(
      screen.getByText(
        "Best next tests: Add question-led hooks (~22% impact, high confidence) · Reduce hashtags (~20% impact, high confidence)"
      )
    ).toBeTruthy();
    expect(screen.getByText("3/3 posts · 75% coverage")).toBeTruthy();
    expect(screen.getByText("Founder on camera with bold text overlay.")).toBeTruthy();
  });
});
