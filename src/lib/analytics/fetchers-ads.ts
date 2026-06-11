import { safeJson } from "@/lib/analytics/fetcher-utils";
import {
  AdCampaign,
  GoogleAdsData,
  MetaAdsData,
  MetaPageData,
  InstagramData,
  InstagramTopPost,
  InstagramAttributeCorrelation,
  RedditAdsData,
  AnalyticsTimestamp,
} from "./types";
import { pearsonCorrelation } from "./stats";
import { enrichInstagramVideoCreatives } from "./instagram-creative-analysis";

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
    const normalized = value.trim().replace(/[$,%\s,]/g, "");
    const parsed = Number(normalized);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

function readString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function countMatches(input: string, pattern: RegExp): number {
  const matches = input.match(pattern);
  return matches ? matches.length : 0;
}

async function withFallback<T>(
  promise: Promise<T>,
  fallback: T,
  timeoutMs: number
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => resolve(fallback), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } catch {
    return fallback;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function toPostedTimeBucket(input: string): InstagramTopPost["postedTimeBucket"] {
  const date = new Date(input);
  const hour = Number.isNaN(date.getTime()) ? 0 : date.getUTCHours();
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 17) return "afternoon";
  if (hour >= 17 && hour < 22) return "evening";
  return "overnight";
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function median(values: number[]): number {
  const filtered = values.filter((value) => Number.isFinite(value) && value > 0).sort((a, b) => a - b);
  if (filtered.length === 0) return 1;
  const middle = Math.floor(filtered.length / 2);
  if (filtered.length % 2 === 0) {
    return (filtered[middle - 1] + filtered[middle]) / 2;
  }
  return filtered[middle];
}

function daysSinceTimestamp(input: string, referenceDate: Date): number {
  const createdAt = new Date(input);
  if (Number.isNaN(createdAt.getTime())) return 0;
  const diffMs = referenceDate.getTime() - createdAt.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return diffMs / (24 * 60 * 60 * 1000);
}

function buildInstagramTopPost(input: {
  id: string;
  caption: string;
  timestamp: string;
  likes: number;
  comments: number;
  mediaType: string;
  mediaProductType: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  followersCount: number;
}): InstagramTopPost {
  const caption = input.caption.trim();
  const engagement = input.likes + input.comments;
  const mediaType = input.mediaType.toUpperCase();
  const mediaProductType = input.mediaProductType?.toUpperCase() ?? null;
  const isReel = mediaProductType === "REELS";
  const isCarousel = mediaType === "CAROUSEL_ALBUM";
  const isVideo = isReel || mediaType === "VIDEO";
  const captionLength = caption.length;
  const hashtagCount = countMatches(caption, /(^|\s)#[^\s#]+/g);
  const mentionCount = countMatches(caption, /(^|\s)@[^\s@]+/g);
  const emojiCount = countMatches(caption, /\p{Extended_Pictographic}/gu);
  const hasQuestionHook = /\?/.test(caption.slice(0, 120));
  const hasCallToAction = /\b(comment|dm|message|reply|share|follow|save|watch|learn more|shop|book|schedule|click|link in bio)\b/i.test(
    caption
  );

  return {
    id: input.id,
    message: caption,
    reach: engagement,
    engagement,
    createdAt: input.timestamp,
    mediaType,
    mediaProductType,
    permalink: input.permalink,
    thumbnailUrl: input.thumbnailUrl,
    likeCount: input.likes,
    commentCount: input.comments,
    performanceScore: engagement,
    engagementRate:
      input.followersCount > 0 ? (engagement / input.followersCount) * 100 : 0,
    ageInDays: 0,
    engagementVelocity: 0,
    captionLength,
    hashtagCount,
    mentionCount,
    emojiCount,
    hasQuestionHook,
    hasCallToAction,
    postedTimeBucket: toPostedTimeBucket(input.timestamp),
    isVideo,
    isReel,
    isCarousel,
  };
}

function scoreInstagramPosts(
  posts: InstagramTopPost[],
  referenceDate: Date
): InstagramTopPost[] {
  if (posts.length === 0) return [];

  const withDerivedMetrics = posts.map((post) => {
    const ageInDays = roundTo(daysSinceTimestamp(post.createdAt, referenceDate), 1);
    const effectiveAgeDays = Math.max(ageInDays, 3);
    const engagementVelocity = roundTo(post.engagement / effectiveAgeDays, 2);
    const engagementRateVelocity = post.engagementRate / effectiveAgeDays;

    return {
      post,
      ageInDays,
      engagementVelocity,
      engagementRateVelocity,
    };
  });

  const engagementMedian = median(withDerivedMetrics.map(({ post }) => post.engagement));
  const velocityMedian = median(
    withDerivedMetrics.map(({ engagementVelocity }) => engagementVelocity)
  );
  const engagementRateVelocityMedian = median(
    withDerivedMetrics.map(({ engagementRateVelocity }) => engagementRateVelocity)
  );

  return withDerivedMetrics.map(
    ({ post, ageInDays, engagementVelocity, engagementRateVelocity }) => ({
      ...post,
      ageInDays,
      engagementVelocity,
      performanceScore: roundTo(
        (post.engagement / engagementMedian) * 0.2 +
          (engagementVelocity / velocityMedian) * 0.35 +
          (engagementRateVelocity / engagementRateVelocityMedian) * 0.45,
        3
      ),
    })
  );
}

function scoreInstagramCorrelationConfidence(input: {
  totalPosts: number;
  eligiblePosts: number;
  trueCount: number;
  falseCount: number;
  correlation: number;
  sampled: boolean;
}): Pick<InstagramAttributeCorrelation, "coveragePct" | "confidenceScore" | "confidence"> {
  const coveragePct =
    input.totalPosts > 0 ? roundTo((input.eligiblePosts / input.totalPosts) * 100, 0) : 0;
  const coverageScore = Math.min(input.eligiblePosts / Math.max(input.totalPosts, 1), 1);
  const balanceScore =
    input.trueCount > 0 && input.falseCount > 0
      ? Math.min(input.trueCount, input.falseCount) / Math.max(input.trueCount, input.falseCount)
      : 0;
  const sampleDepthScore = Math.min(Math.min(input.trueCount, input.falseCount) / 3, 1);
  const strengthScore = Math.min(Math.abs(input.correlation) / 0.4, 1);
  const sampledScore = input.sampled ? 0.55 : 1;
  const confidenceScore = roundTo(
    (coverageScore * 0.3 +
      balanceScore * 0.2 +
      sampleDepthScore * 0.2 +
      strengthScore * 0.2 +
      sampledScore * 0.1) *
      100,
    0
  );

  return {
    coveragePct,
    confidenceScore,
    confidence:
      confidenceScore >= 75 ? "high" : confidenceScore >= 55 ? "medium" : "low",
  };
}

function getInstagramAttributeDefs(): Array<{
  key: string;
  label: string;
  source: InstagramAttributeCorrelation["source"];
  test: (post: InstagramTopPost) => boolean | null;
}> {
  return [
    { key: "isReel", label: "Reels", source: "metadata", test: (post) => post.isReel },
    { key: "isVideo", label: "Video posts", source: "metadata", test: (post) => post.isVideo },
    { key: "isCarousel", label: "Carousels", source: "metadata", test: (post) => post.isCarousel },
    {
      key: "shortCaption",
      label: "Short captions (<= 80 chars)",
      source: "metadata",
      test: (post) => post.captionLength > 0 && post.captionLength <= 80,
    },
    {
      key: "longCaption",
      label: "Long captions (>= 220 chars)",
      source: "metadata",
      test: (post) => post.captionLength >= 220,
    },
    {
      key: "hasHashtags",
      label: "Hashtags",
      source: "metadata",
      test: (post) => post.hashtagCount > 0,
    },
    {
      key: "hasMentions",
      label: "Mentions",
      source: "metadata",
      test: (post) => post.mentionCount > 0,
    },
    {
      key: "hasQuestionHook",
      label: "Question-led hooks",
      source: "metadata",
      test: (post) => post.hasQuestionHook,
    },
    {
      key: "hasCallToAction",
      label: "Clear CTA language",
      source: "metadata",
      test: (post) => post.hasCallToAction,
    },
    {
      key: "morningPost",
      label: "Morning publish window",
      source: "metadata",
      test: (post) => post.postedTimeBucket === "morning",
    },
    {
      key: "eveningPost",
      label: "Evening publish window",
      source: "metadata",
      test: (post) => post.postedTimeBucket === "evening",
    },
    {
      key: "hasPersonVisible",
      label: "Person visible in creative",
      source: "ai_visual",
      test: (post) => post.hasPersonVisible ?? null,
    },
    {
      key: "hasTextOverlayVisible",
      label: "Visible text overlay",
      source: "ai_visual",
      test: (post) => post.hasTextOverlayVisible ?? null,
    },
    {
      key: "looksLikeShopFloor",
      label: "Shop-floor visual",
      source: "ai_visual",
      test: (post) => post.looksLikeShopFloor ?? null,
    },
    {
      key: "looksLikeProductDemo",
      label: "Product demo visual",
      source: "ai_visual",
      test: (post) => post.looksLikeProductDemo ?? null,
    },
    {
      key: "looksEducational",
      label: "Educational creative",
      source: "ai_visual",
      test: (post) => post.looksEducational ?? null,
    },
    {
      key: "looksPromotional",
      label: "Promotional creative",
      source: "ai_visual",
      test: (post) => post.looksPromotional ?? null,
    },
  ];
}

function buildInstagramAttributeCorrelations(
  posts: InstagramTopPost[],
  creativeAnalysis: {
    analyzedVideos: number;
    totalVideoCandidates: number;
    sampled: boolean;
  }
): InstagramAttributeCorrelation[] {
  if (posts.length < 3) return [];

  const attributeDefs = getInstagramAttributeDefs();

  return attributeDefs
    .map((attribute) => {
      const eligiblePosts = posts.filter((post) => attribute.test(post) !== null);
      if (eligiblePosts.length < 4) return null;

      const performance = eligiblePosts.map((post) => post.performanceScore);
      const flags = eligiblePosts.map((post) => (attribute.test(post) ? 1 : 0));
      const trueScores = eligiblePosts
        .filter((post) => attribute.test(post) === true)
        .map((post) => post.performanceScore);
      const falseScores = eligiblePosts
        .filter((post) => attribute.test(post) === false)
        .map((post) => post.performanceScore);
      if (trueScores.length < 2 || falseScores.length < 2) return null;

      const trueAvgEngagement =
        trueScores.reduce((sum, value) => sum + value, 0) / trueScores.length;
      const falseAvgEngagement =
        falseScores.reduce((sum, value) => sum + value, 0) / falseScores.length;
      const liftPct =
        falseAvgEngagement > 0
          ? ((trueAvgEngagement - falseAvgEngagement) / falseAvgEngagement) * 100
          : 0;
      const correlation = pearsonCorrelation(flags, performance);
      const direction = correlation >= 0 ? "higher" : "lower";
      const liftAbs = Math.abs(liftPct);
      const sampled = attribute.source === "ai_visual" && creativeAnalysis.sampled;
      const confidence = scoreInstagramCorrelationConfidence({
        totalPosts: posts.length,
        eligiblePosts: eligiblePosts.length,
        trueCount: trueScores.length,
        falseCount: falseScores.length,
        correlation,
        sampled,
      });

      return {
        key: attribute.key,
        label: attribute.label,
        source: attribute.source,
        correlation,
        sampleSize: trueScores.length,
        comparisonSampleSize: falseScores.length,
        eligiblePostCount: eligiblePosts.length,
        coveragePct: confidence.coveragePct,
        trueAvgEngagement,
        falseAvgEngagement,
        liftPct,
        sampled,
        confidence: confidence.confidence,
        confidenceScore: confidence.confidenceScore,
        interpretation:
          liftAbs >= 1
            ? `${attribute.label} correlate with ${direction} normalized performance (${liftPct >= 0 ? "+" : ""}${liftPct.toFixed(
                0
              )}% vs. posts without that attribute).`
            : `${attribute.label} show only a small normalized-performance difference vs. posts without that attribute.`,
      } satisfies InstagramAttributeCorrelation;
    })
    .filter((item): item is InstagramAttributeCorrelation => item !== null)
    .sort((left, right) => {
      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }
      return Math.abs(right.correlation) - Math.abs(left.correlation);
    });
}

function buildInstagramPerformanceDrivers(
  posts: InstagramTopPost[],
  correlations: InstagramAttributeCorrelation[]
): InstagramTopPost[] {
  const attributeDefs = new Map(
    getInstagramAttributeDefs().map((attribute) => [attribute.key, attribute])
  );
  const positiveSignals = correlations
    .filter((item) => item.correlation > 0 && item.confidence !== "low")
    .sort((left, right) => {
      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }
      if (Math.abs(right.correlation) !== Math.abs(left.correlation)) {
        return Math.abs(right.correlation) - Math.abs(left.correlation);
      }
      return right.liftPct - left.liftPct;
    });

  return posts.map((post) => {
    const performanceDrivers = positiveSignals
      .filter((item) => attributeDefs.get(item.key)?.test(post) === true)
      .slice(0, 3)
      .map((item) => ({
        key: item.key,
        label: item.label,
        source: item.source,
        sampled: item.sampled,
        confidence: item.confidence,
        liftPct: item.liftPct,
      }));

    return performanceDrivers.length > 0 ? { ...post, performanceDrivers } : post;
  });
}

function buildInstagramOptimizationIdeas(
  posts: InstagramTopPost[],
  correlations: InstagramAttributeCorrelation[]
): InstagramTopPost[] {
  const attributeDefs = new Map(
    getInstagramAttributeDefs().map((attribute) => [attribute.key, attribute])
  );
  const actionableSignals = correlations.filter((item) => item.confidence !== "low");

  return posts.map((post) => {
    const nextTests = actionableSignals
      .filter((item) => {
        const state = attributeDefs.get(item.key)?.test(post);
        if (state === null || state === undefined) return false;
        if (item.correlation > 0) return state === false;
        if (item.correlation < 0) return state === true;
        return false;
      })
      .sort((left, right) => {
        if (right.confidenceScore !== left.confidenceScore) {
          return right.confidenceScore - left.confidenceScore;
        }
        if (Math.abs(right.correlation) !== Math.abs(left.correlation)) {
          return Math.abs(right.correlation) - Math.abs(left.correlation);
        }
        return Math.abs(right.liftPct) - Math.abs(left.liftPct);
      })
      .slice(0, 2)
      .map((item) => ({
        key: item.key,
        label: item.label,
        action: (item.correlation > 0 ? "add" : "reduce") as "add" | "reduce",
        source: item.source,
        sampled: item.sampled,
        confidence: item.confidence,
        estimatedImpactPct: Math.abs(item.liftPct),
      }));

    return nextTests.length > 0 ? { ...post, nextTests } : post;
  });
}

function buildInstagramTestBacklog(
  posts: InstagramTopPost[]
): NonNullable<InstagramData["testBacklog"]> {
  const summary = new Map<
    string,
    {
      key: string;
      label: string;
      action: "add" | "reduce";
      source: "metadata" | "ai_visual";
      sampled: boolean;
      confidence: "low" | "medium" | "high";
      estimatedImpactPct: number;
      supportingVideos: number;
    }
  >();

  for (const post of posts) {
    for (const idea of post.nextTests ?? []) {
      const id = `${idea.action}:${idea.key}`;
      const existing = summary.get(id);
      if (existing) {
        existing.supportingVideos += 1;
        existing.estimatedImpactPct = roundTo(
          (existing.estimatedImpactPct + idea.estimatedImpactPct) / 2,
          0
        );
        if (
          (idea.confidence === "high" && existing.confidence !== "high") ||
          (idea.confidence === "medium" && existing.confidence === "low")
        ) {
          existing.confidence = idea.confidence;
        }
        existing.sampled = existing.sampled || idea.sampled;
      } else {
        summary.set(id, {
          ...idea,
          supportingVideos: 1,
        });
      }
    }
  }

  return Array.from(summary.values())
    .sort((left, right) => {
      if (right.supportingVideos !== left.supportingVideos) {
        return right.supportingVideos - left.supportingVideos;
      }
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      if (confidenceOrder[right.confidence] !== confidenceOrder[left.confidence]) {
        return confidenceOrder[right.confidence] - confidenceOrder[left.confidence];
      }
      return right.estimatedImpactPct - left.estimatedImpactPct;
    })
    .slice(0, 3);
}

function buildInstagramExperimentPlan(
  posts: InstagramTopPost[],
  testBacklog: NonNullable<InstagramData["testBacklog"]>
): NonNullable<InstagramData["experimentPlan"]> {
  return testBacklog.slice(0, 3).map((idea) => {
    const exampleVideos = posts
      .filter((post) =>
        post.nextTests?.some((test) => test.key === idea.key && test.action === idea.action)
      )
      .slice(0, 2)
      .map((post) => {
        const normalized = post.message.trim();
        return normalized.length > 60 ? `${normalized.slice(0, 60).trimEnd()}...` : normalized;
      });

    return {
      key: `${idea.action}:${idea.key}`,
      title: `${idea.action === "add" ? "Test adding" : "Test reducing"} ${idea.label.toLowerCase()}`,
      brief:
        idea.action === "add"
          ? `Create follow-up variants that introduce ${idea.label.toLowerCase()} in otherwise similar videos.`
          : `Create follow-up variants that reduce ${idea.label.toLowerCase()} while keeping the core hook similar.`,
      action: idea.action,
      source: idea.source,
      sampled: idea.sampled,
      confidence: idea.confidence,
      estimatedImpactPct: idea.estimatedImpactPct,
      supportingVideos: idea.supportingVideos,
      exampleVideos,
    };
  });
}

function buildInstagramVideosToImprove(
  posts: InstagramTopPost[]
): NonNullable<InstagramData["videosToImprove"]> {
  return posts
    .filter((post) => post.isVideo && (post.nextTests?.length ?? 0) > 0)
    .sort((left, right) => {
      if (left.performanceScore !== right.performanceScore) {
        return left.performanceScore - right.performanceScore;
      }
      return right.createdAt.localeCompare(left.createdAt);
    })
    .slice(0, 3);
}

function buildInstagramOpportunities(
  correlations: InstagramAttributeCorrelation[]
): NonNullable<InstagramData["opportunities"]> {
  return correlations
    .filter(
      (item) =>
        item.correlation > 0 &&
        item.confidence !== "low" &&
        item.eligiblePostCount > 0 &&
        item.sampleSize > 0
    )
    .map((item) => ({
      key: item.key,
      label: item.label,
      source: item.source,
      sampled: item.sampled,
      confidence: item.confidence,
      estimatedImpactPct: Math.abs(item.liftPct),
      adoptionPct: roundTo((item.sampleSize / item.eligiblePostCount) * 100, 0),
    }))
    .filter((item) => item.adoptionPct <= 50)
    .sort((left, right) => {
      if (left.adoptionPct !== right.adoptionPct) {
        return left.adoptionPct - right.adoptionPct;
      }
      const confidenceOrder = { high: 3, medium: 2, low: 1 };
      if (confidenceOrder[right.confidence] !== confidenceOrder[left.confidence]) {
        return confidenceOrder[right.confidence] - confidenceOrder[left.confidence];
      }
      return right.estimatedImpactPct - left.estimatedImpactPct;
    })
    .slice(0, 3);
}

function buildInstagramWinningPatterns(
  correlations: InstagramAttributeCorrelation[]
): InstagramData["winningPatterns"] {
  const strongest = correlations
    .filter(
      (item) => item.correlation > 0 && item.sampleSize >= 2 && item.confidence !== "low"
    )
    .sort((left, right) => {
      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }
      if (Math.abs(right.correlation) !== Math.abs(left.correlation)) {
        return Math.abs(right.correlation) - Math.abs(left.correlation);
      }
      return right.liftPct - left.liftPct;
    })
    .slice(0, 3);

  return strongest.map((item) => ({
    title: item.label,
    detail:
      item.liftPct >= 1
        ? `${item.label} are associated with ${item.liftPct.toFixed(0)}% stronger normalized performance on average (${item.confidence} confidence).`
        : `${item.label} show a modest positive normalized-performance signal (${item.confidence} confidence).`,
    source: item.source,
    sampled: item.sampled,
    confidence: item.confidence,
  }));
}

function buildInstagramLosingPatterns(
  correlations: InstagramAttributeCorrelation[]
): InstagramData["losingPatterns"] {
  const weakest = correlations
    .filter(
      (item) => item.correlation < 0 && item.sampleSize >= 2 && item.confidence !== "low"
    )
    .sort((left, right) => {
      if (right.confidenceScore !== left.confidenceScore) {
        return right.confidenceScore - left.confidenceScore;
      }
      if (Math.abs(right.correlation) !== Math.abs(left.correlation)) {
        return Math.abs(right.correlation) - Math.abs(left.correlation);
      }
      return left.liftPct - right.liftPct;
    })
    .slice(0, 3);

  return weakest.map((item) => ({
    title: item.label,
    detail:
      item.liftPct <= -1
        ? `${item.label} are associated with ${Math.abs(item.liftPct).toFixed(0)}% weaker normalized performance on average (${item.confidence} confidence).`
        : `${item.label} show a modest negative normalized-performance signal (${item.confidence} confidence).`,
    source: item.source,
    sampled: item.sampled,
    confidence: item.confidence,
  }));
}

function extractApiErrorMessage(payload: unknown): string | null {
  const record = asRecord(payload);
  if (!record) return null;

  const nestedError = asRecord(record.error);
  const candidates = [
    nestedError?.message,
    record.message,
    record.error_description,
    typeof record.error === "string" ? record.error : null,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function extractApiErrorFields(payload: unknown): string[] {
  const record = asRecord(payload);
  if (!record) return [];

  const candidates = [asArray(asRecord(record.error)?.fields), asArray(record.fields)];
  const messages: string[] = [];

  for (const candidateList of candidates) {
    for (const item of candidateList) {
      const fieldRecord = asRecord(item);
      if (!fieldRecord) continue;
      const field = typeof fieldRecord.field === "string" ? fieldRecord.field.trim() : "";
      const message =
        typeof fieldRecord.message === "string" ? fieldRecord.message.trim() : "";
      if (!field && !message) continue;
      messages.push(field && message ? `${field}: ${message}` : field || message);
      if (messages.length >= 5) {
        return messages;
      }
    }
  }

  return messages;
}

async function parseErrorBody(response: Response): Promise<string> {
  const text = await response.text().catch(() => "");
  const trimmed = text.trim();
  if (!trimmed) {
    return response.statusText || "Unknown error";
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      const message = extractApiErrorMessage(parsed);
      const fields = extractApiErrorFields(parsed);
      if (message || fields.length > 0) {
        const details = [message, fields.length > 0 ? `fields: ${fields.join("; ")}` : null]
          .filter(Boolean)
          .join(" ");
        if (details) return details.slice(0, 500);
      }
    } catch {
      // Fall back to raw text.
    }
  }

  return trimmed.slice(0, 500);
}

function isInvalidMetaInsightsMetricError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("valid insights metric") ||
    normalized.includes("invalid metric")
  );
}

function normalizeBearerToken(value: string): string {
  return value.replace(/^Bearer\s+/i, "").trim();
}

type MetaPageInsightMetric = {
  name: string;
  values?: Array<{ value: string | number }>;
};

type MetaGraphPage<T> = {
  data?: T[];
  paging?: {
    next?: string;
    cursors?: {
      after?: string;
    };
  };
};

function normalizeMetaAdAccountId(adAccountId: string): string {
  return adAccountId.trim().replace(/^act_/i, "");
}

function looksLikeMetaAppAccessToken(accessToken: string): boolean {
  const normalized = accessToken.trim();
  return Boolean(normalized && /^\d+\|/.test(normalized));
}

async function fetchMetaGraphPages<T>(input: {
  url: URL;
  headers: Record<string, string>;
  label: string;
  maxPages?: number;
}): Promise<{ rows: T[]; truncated: boolean }> {
  const rows: T[] = [];
  const maxPages = Math.max(1, input.maxPages ?? 100);
  let url: URL | null = new URL(input.url.toString());
  let truncated = false;

  for (let page = 0; url && page < maxPages; page += 1) {
    const response = await fetch(url, { headers: input.headers, cache: "no-store" });
    if (!response.ok) {
      throw new Error(
        `${input.label} error (${response.status}): ${await parseErrorBody(response)}`
      );
    }

    const payload = (await safeJson<MetaGraphPage<T>>(response, input.label)) as MetaGraphPage<T>;
    rows.push(...(payload.data ?? []));

    const nextUrl = payload.paging?.next?.trim();
    if (nextUrl) {
      if (page === maxPages - 1) {
        truncated = true;
        break;
      }
      url = new URL(nextUrl);
      continue;
    }

    const after = payload.paging?.cursors?.after?.trim();
    if (after && after !== url.searchParams.get("after")) {
      if (page === maxPages - 1) {
        truncated = true;
        break;
      }
      const nextPageUrl: URL = new URL(url.toString());
      nextPageUrl.searchParams.set("after", after);
      url = nextPageUrl;
      continue;
    }

    url = null;
  }

  return { rows, truncated };
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
    const parsed = readNumber(direct);
    const isMicros =
      (typeof direct === "number" && Number.isInteger(direct)) ||
      (typeof direct === "string" && /^-?\d+$/.test(direct.trim()));
    return isMicros ? parsed / 1_000_000 : parsed;
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

function startOfUtcDay(date: Date): Date {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
}

function addUtcDays(date: Date, days: number): Date {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value;
}

const REDDIT_REPORT_CORE_FIELDS = [
  "CAMPAIGN_ID",
  "SPEND",
  "IMPRESSIONS",
  "CLICKS",
] as const;

const REDDIT_REPORT_CONVERSION_FIELDS = [
  "KEY_CONVERSION_TOTAL_COUNT",
  "REDDIT_LEADS",
] as const;

interface RedditReportVariant {
  label: string;
  includeTimeZone: boolean;
  fields: readonly string[];
}

function readRedditNextCampaignUrl(payload: UnknownRecord, currentUrl: URL): URL | null {
  const pagination = asRecord(payload.pagination);
  const paging = asRecord(payload.paging);
  const directNext =
    readString(pagination?.next_url) ??
    readString(pagination?.nextUrl) ??
    readString(pagination?.next) ??
    readString(paging?.next) ??
    readString(payload.next_url) ??
    readString(payload.nextUrl) ??
    readString(payload.next);

  if (directNext) {
    return new URL(directNext, currentUrl);
  }

  const cursors = asRecord(paging?.cursors) ?? asRecord(pagination?.cursors);
  const after =
    readString(cursors?.after) ??
    readString(pagination?.after) ??
    readString(payload.after);
  if (!after || after === currentUrl.searchParams.get("after")) {
    return null;
  }

  const nextUrl = new URL(currentUrl.toString());
  nextUrl.searchParams.set("after", after);
  return nextUrl;
}

async function fetchRedditCampaigns(input: {
  accessToken: string;
  adAccountId: string;
  baseHeaders: Record<string, string>;
  maxPages?: number;
}): Promise<{ campaigns: Array<{ id?: string; name?: string }>; truncated: boolean }> {
  const campaigns: Array<{ id?: string; name?: string }> = [];
  const maxPages = Math.max(1, input.maxPages ?? 100);
  let url: URL | null = new URL(
    `https://ads-api.reddit.com/api/v3/ad_accounts/${input.adAccountId}/campaigns`,
  );
  let truncated = false;

  for (let page = 0; url && page < maxPages; page += 1) {
    const campaignResponse = await fetch(url.toString(), {
      method: "GET",
      headers: {
        ...input.baseHeaders,
        Authorization: `Bearer ${input.accessToken}`,
      },
      cache: "no-store",
    });

    if (!campaignResponse.ok) {
      throw new Error(
        `Reddit campaigns error (${campaignResponse.status}): ${await parseErrorBody(campaignResponse)}`
      );
    }

    const campaignsPayload = (await safeJson<UnknownRecord>(
      campaignResponse,
      "Reddit campaigns",
    )) as UnknownRecord;
    campaigns.push(
      ...asArray(campaignsPayload.data)
        .map(asRecord)
        .filter((campaign): campaign is UnknownRecord => Boolean(campaign))
        .map((campaign) => ({
          id: readString(campaign.id) ?? undefined,
          name: readString(campaign.name) ?? undefined,
        })),
    );
    const nextUrl = readRedditNextCampaignUrl(campaignsPayload, url);
    if (nextUrl && page === maxPages - 1) {
      truncated = true;
      break;
    }
    url = nextUrl;
  }

  return { campaigns, truncated };
}

async function fetchRedditReportMetrics(input: {
  accessToken: string;
  adAccountId: string;
  baseHeaders: Record<string, string>;
  startsAtIso: string;
  endsAtIso: string;
}): Promise<UnknownRecord[]> {
  const variants: RedditReportVariant[] = [
    {
      label: "full",
      includeTimeZone: true,
      fields: [...REDDIT_REPORT_CORE_FIELDS, ...REDDIT_REPORT_CONVERSION_FIELDS],
    },
    {
      label: "full-no-timezone",
      includeTimeZone: false,
      fields: [...REDDIT_REPORT_CORE_FIELDS, ...REDDIT_REPORT_CONVERSION_FIELDS],
    },
    {
      label: "core",
      includeTimeZone: false,
      fields: REDDIT_REPORT_CORE_FIELDS,
    },
  ];

  const attemptedLabels: string[] = [];
  let lastErrorMessage = "";
  let lastStatus = 0;
  let lastVariantLabel = variants[0]?.label ?? "full";

  for (const variant of variants) {
    const payload = {
      data: {
        starts_at: input.startsAtIso,
        ends_at: input.endsAtIso,
        ...(variant.includeTimeZone ? { time_zone_id: "UTC" } : {}),
        breakdowns: ["CAMPAIGN_ID"],
        fields: [...variant.fields],
      },
    };

    const reportsResponse = await fetch(
      `https://ads-api.reddit.com/api/v3/ad_accounts/${input.adAccountId}/reports`,
      {
        method: "POST",
        headers: {
          ...input.baseHeaders,
          Authorization: `Bearer ${input.accessToken}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify(payload),
      }
    );

    if (reportsResponse.ok) {
      const reportsPayload = (await safeJson<{
        data?: {
          metrics?: UnknownRecord[];
        };
      }>(reportsResponse, "Reddit reports")) as {
        data?: {
          metrics?: UnknownRecord[];
        };
      };

      return reportsPayload.data?.metrics ?? [];
    }

    const errorMessage = await parseErrorBody(reportsResponse);
    attemptedLabels.push(variant.label);
    lastErrorMessage = errorMessage;
    lastStatus = reportsResponse.status;
    lastVariantLabel = variant.label;

    if (reportsResponse.status !== 400 || variant.label === "core") {
      break;
    }
  }

  const retrySuffix =
    attemptedLabels.length > 1
      ? ` after retrying ${attemptedLabels.slice(0, -1).join(", ")}`
      : "";
  throw new Error(
    `Reddit reports error (${lastStatus}): ${lastErrorMessage}. starts_at=${input.startsAtIso} ends_at=${input.endsAtIso} request=${lastVariantLabel}${retrySuffix}`
  );
}

/**
 * Fetch Google Ads data for a date range (defaults to last 30d).
 */
export async function fetchGoogleAdsData(
  devToken: string,
  customerId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  loginCustomerId?: string | null,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<GoogleAdsData> {
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    cache: "no-store",
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

  const tokenData = await safeJson<{ access_token?: string }>(tokenResponse, "Google Ads token");
  const accessToken = tokenData.access_token?.trim();
  if (!accessToken) {
    throw new Error("Google token response did not include access_token.");
  }

  const cleanCustomerId = customerId.replace(/-/g, "").trim();
  const cleanLoginCustomerId = loginCustomerId?.replace(/-/g, "").trim();

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const fromKey = useRange ? rangeFrom!.toISOString().slice(0, 10) : null;
  const toKey = useRange ? rangeTo!.toISOString().slice(0, 10) : null;

  const dateWhere = useRange
    ? `segments.date BETWEEN '${fromKey}' AND '${toKey}'`
    : "segments.date DURING LAST_30_DAYS";

  const gaqlQuery = `
    SELECT campaign.id, campaign.name, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions
    FROM campaign
    WHERE ${dateWhere} AND campaign.status = 'ENABLED'
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
      cache: "no-store",
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
        campaignId: readString(campaign?.id) ?? undefined,
        customerId: cleanCustomerId || undefined,
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
 * Fetch Meta Ads data for a date range (defaults to last 30d).
 */
export async function fetchMetaAdsData(
  accessToken: string,
  adAccountId: string,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<MetaAdsData> {
  const token = normalizeBearerToken(accessToken);
  if (looksLikeMetaAppAccessToken(token)) {
    throw new Error(
      "Meta Ads token error: META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). Imladris requires a User/System User token with ads_read or ads_management and access to the configured ad account."
    );
  }

  const accountId = normalizeMetaAdAccountId(adAccountId);
  const baseHeaders = { Authorization: `Bearer ${token}` };

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  // The Marketing API `time_range` JSON param is inclusive on both ends, and
  // since === until is the documented way to query a single day. Do NOT extend
  // it the way toMetaSinceUntilDateStrings does for query-string `since`/`until`
  // params, or single-day requests would silently include an extra day of spend.
  const since = useRange ? rangeFrom!.toISOString().slice(0, 10) : null;
  const until = useRange ? rangeTo!.toISOString().slice(0, 10) : null;

  const insightsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/act_${accountId}/insights`
  );
  insightsUrl.searchParams.set("fields", "spend,impressions,clicks,actions");
  if (useRange) {
    insightsUrl.searchParams.set("time_range", JSON.stringify({ since, until }));
  } else {
    insightsUrl.searchParams.set("date_preset", "last_30d");
  }
  insightsUrl.searchParams.set("level", "account");

  const insightsResponse = await fetch(insightsUrl, { headers: baseHeaders, cache: "no-store" });
  if (!insightsResponse.ok) {
    throw new Error(
      `Meta Ads insights error (${insightsResponse.status}): ${await parseErrorBody(insightsResponse)}`
    );
  }

  const insightsData = (await safeJson<{
    data?: Array<{
      spend?: string | number;
      impressions?: string | number;
      clicks?: string | number;
      actions?: Array<{ action_type?: string; value?: string | number }>;
    }>;
  }>(insightsResponse, "Meta Ads insights")) as {
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
  campaignsUrl.searchParams.set("fields", "id,name,insights{spend,impressions,clicks,actions}");
  if (useRange) {
    campaignsUrl.searchParams.set("time_range", JSON.stringify({ since, until }));
  } else {
    campaignsUrl.searchParams.set("date_preset", "last_30d");
  }

  const campaignPageResult = await fetchMetaGraphPages<{
    id?: string;
    name?: string;
    insights?: {
      data?: Array<{
        spend?: string | number;
        impressions?: string | number;
        clicks?: string | number;
        actions?: Array<{ action_type?: string; value?: string | number }>;
      }>;
    };
  }>({
    url: campaignsUrl,
    headers: baseHeaders,
    label: "Meta Ads campaigns",
  });
  const campaignRows = campaignPageResult.rows;

  const campaigns: AdCampaign[] = [];
  for (const campaign of campaignRows) {
    const insight = campaign.insights?.data?.[0];
    if (!insight) continue;

    const spend = readNumber(insight.spend);
    const impressions = readNumber(insight.impressions);
    const clicks = readNumber(insight.clicks);
    const conversions = extractMetaConversions(insight.actions);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    const cpc = clicks > 0 ? spend / clicks : 0;

    campaigns.push({
      campaignId: readString(campaign.id) ?? undefined,
      adAccountId: accountId,
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
    _meta: {
      ...makeMeta("live"),
      truncated: campaignPageResult.truncated,
      truncatedResources: campaignPageResult.truncated ? ["campaigns"] : [],
    },
  };
}

/**
 * Fetch Meta Page Insights data.
 */
function buildMetaPageInsightsUrl(input: {
  normalizedPageId: string;
  metrics: string[];
  useRange: boolean;
  since: string | null;
  until: string | null;
}): URL {
  const insightsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${input.normalizedPageId}/insights`
  );
  insightsUrl.searchParams.set("metric", input.metrics.join(","));
  if (input.useRange) {
    insightsUrl.searchParams.set("period", "day");
    insightsUrl.searchParams.set("since", input.since!);
    insightsUrl.searchParams.set("until", input.until!);
  } else {
    insightsUrl.searchParams.set("period", "days_28");
  }
  return insightsUrl;
}

async function fetchMetaPageInsightMetrics(input: {
  normalizedPageId: string;
  metrics: string[];
  useRange: boolean;
  since: string | null;
  until: string | null;
  headers: Record<string, string>;
}): Promise<MetaPageInsightMetric[]> {
  const insightsUrl = buildMetaPageInsightsUrl(input);
  const insightsResponse = await fetch(insightsUrl, { headers: input.headers, cache: "no-store" });
  if (insightsResponse.ok) {
    const insightsData = (await safeJson<{
      data?: MetaPageInsightMetric[];
    }>(insightsResponse, "Meta Page insights")) as {
      data?: MetaPageInsightMetric[];
    };
    return insightsData.data ?? [];
  }

  const errorBody = await parseErrorBody(insightsResponse);
  if (!isInvalidMetaInsightsMetricError(errorBody)) {
    throw new Error(`Meta Page insights error (${insightsResponse.status}): ${errorBody}`);
  }

  if (input.metrics.length > 2) {
    const requiredUrl = buildMetaPageInsightsUrl({
      ...input,
      metrics: input.metrics.slice(0, 2),
    });
    const requiredResponse = await fetch(requiredUrl, { headers: input.headers, cache: "no-store" });
    if (requiredResponse.ok) {
      const requiredData = (await safeJson<{
        data?: MetaPageInsightMetric[];
      }>(requiredResponse, "Meta Page insights required metrics")) as {
        data?: MetaPageInsightMetric[];
      };
      return requiredData.data ?? [];
    }

    const requiredError = await parseErrorBody(requiredResponse);
    if (!isInvalidMetaInsightsMetricError(requiredError)) {
      throw new Error(`Meta Page insights error (${requiredResponse.status}): ${requiredError}`);
    }
  }

  const validMetrics: MetaPageInsightMetric[] = [];
  for (const metric of input.metrics) {
    const metricUrl = buildMetaPageInsightsUrl({
      ...input,
      metrics: [metric],
    });
    const metricResponse = await fetch(metricUrl, { headers: input.headers, cache: "no-store" });
    if (metricResponse.ok) {
      const metricData = (await safeJson<{
        data?: MetaPageInsightMetric[];
      }>(metricResponse, `Meta Page insights ${metric}`)) as {
        data?: MetaPageInsightMetric[];
      };
      validMetrics.push(...(metricData.data ?? []));
      continue;
    }

    const metricError = await parseErrorBody(metricResponse);
    if (!isInvalidMetaInsightsMetricError(metricError)) {
      throw new Error(`Meta Page insights error (${metricResponse.status}): ${metricError}`);
    }
  }

  return validMetrics;
}

async function resolveMetaPageAccessToken(input: {
  userAccessToken: string;
  normalizedPageId: string;
}): Promise<string> {
  const accountsUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/accounts`);
  accountsUrl.searchParams.set("fields", "id,access_token");
  accountsUrl.searchParams.set("limit", "200");

  try {
    const pages = await fetchMetaGraphPages<{ id?: string; access_token?: string }>({
      url: accountsUrl,
      headers: { Authorization: `Bearer ${input.userAccessToken}` },
      label: "Meta Page accounts",
    });
    const page = pages.rows.find((item) => item.id === input.normalizedPageId);
    return page?.access_token?.trim() || input.userAccessToken;
  } catch {
    return input.userAccessToken;
  }
}

/**
 * Serialize a date range to Graph API query-string `since`/`until` values
 * (YYYY-MM-DD).
 *
 * The Graph API parses bare date strings as midnight UTC and requires
 * since < until, so a single-day range serialized naively (since === until)
 * is rejected with "(#100) since should be less than until". When both
 * bounds land on the same UTC day, extend `until` to the next day — `until`
 * is an exclusive bound for date strings, so the request covers exactly
 * that one day.
 *
 * This applies to query-string `since`/`until` params (Page posts, Page
 * insights). The Marketing API `time_range` JSON param is inclusive on both
 * ends and accepts since === until for a single day, so it must NOT be
 * extended this way.
 */
function toMetaSinceUntilDateStrings(
  fromDate: Date,
  toDate: Date
): { since: string; until: string } {
  const since = fromDate.toISOString().slice(0, 10);
  let until = toDate.toISOString().slice(0, 10);
  if (since === until) {
    const nextDay = new Date(`${until}T00:00:00.000Z`);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    until = nextDay.toISOString().slice(0, 10);
  }
  return { since, until };
}

export async function fetchMetaPageData(
  accessToken: string,
  pageId: string,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<MetaPageData> {
  const token = normalizeBearerToken(accessToken);
  if (looksLikeMetaAppAccessToken(token)) {
    throw new Error(
      "Meta Page token error: META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). Imladris requires a User/System User token with ads_read or ads_management and access to the configured Page."
    );
  }

  const normalizedPageId = pageId.trim();
  const pageAccessToken = await resolveMetaPageAccessToken({
    userAccessToken: token,
    normalizedPageId,
  });
  const baseHeaders = { Authorization: `Bearer ${pageAccessToken}` };

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const range = useRange ? toMetaSinceUntilDateStrings(rangeFrom!, rangeTo!) : null;
  const since = range?.since ?? null;
  const until = range?.until ?? null;

  const pageUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${normalizedPageId}`
  );
  pageUrl.searchParams.set("fields", "fan_count,followers_count");

  const pageResponse = await fetch(pageUrl, { headers: baseHeaders, cache: "no-store" });
  if (!pageResponse.ok) {
    throw new Error(
      `Meta Page profile error (${pageResponse.status}): ${await parseErrorBody(pageResponse)}`
    );
  }
  const pageData = (await safeJson<{
    fan_count?: string | number;
    followers_count?: string | number;
  }>(pageResponse, "Meta Page profile")) as {
    fan_count?: string | number;
    followers_count?: string | number;
  };

  const pageLikes = readNumber(pageData.fan_count);
  const pageFollowers = readNumber(pageData.followers_count);

  const insightsMetrics = await fetchMetaPageInsightMetrics({
    normalizedPageId,
    metrics: ["page_impressions", "page_engaged_users", "page_views_total", "page_total_actions"],
    useRange,
    since,
    until,
    headers: baseHeaders,
  });

  let postReach30d = 0;
  let postEngagement30d = 0;
  for (const metric of insightsMetrics) {
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
    "message,created_time,insights.metric(post_impressions_unique,post_clicks){name,values}"
  );
  postsUrl.searchParams.set("limit", "100");
  if (useRange) {
    postsUrl.searchParams.set("since", since!);
    postsUrl.searchParams.set("until", until!);
  }

  const postPageResult = await fetchMetaGraphPages<{
    message?: string;
    created_time?: string;
    insights?: {
      data?: Array<{
        name: string;
        values?: Array<{ value: string | number }>;
      }>;
    };
  }>({
    url: postsUrl,
    headers: baseHeaders,
    label: "Meta Page posts",
  });
  const postRows = postPageResult.rows;

  const topPosts: { message: string; reach: number; engagement: number; createdAt: string }[] = [];
  for (const post of postRows) {
    let reach = 0;
    let engagement = 0;
    for (const metric of post.insights?.data ?? []) {
      const metricValue = readNumber(metric.values?.[0]?.value);
      if (metric.name === "post_impressions_unique") {
        reach = metricValue;
      }
      if (metric.name === "post_clicks") {
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

  const meta = makeMeta("live");
  meta.truncated = postPageResult.truncated;
  meta.truncatedResources = postPageResult.truncated ? ["posts"] : [];

  return {
    pageLikes,
    pageFollowers,
    postReach30d,
    postEngagement30d,
    traffic: 0,
    bounceRate: 0,
    clicks: 0,
    returningVisitors: 0,
    topPosts,
    _meta: meta,
  };
}

export async function fetchMetaInstagramData(
  accessToken: string,
  instagramAccountId: string,
  options?: { pageId?: string },
  from?: Date,
  to?: Date
): Promise<InstagramData> {
  const token = normalizeBearerToken(accessToken);
  if (looksLikeMetaAppAccessToken(token)) {
    throw new Error(
      "Meta Instagram token error: META_ACCESS_TOKEN looks like an app access token (app_id|app_secret). Imladris requires a User/System User token with ads_read or ads_management and access to the configured Instagram account."
    );
  }

  const baseHeaders = { Authorization: `Bearer ${token}` };
  const configuredAccountId = instagramAccountId.trim();

  type InstagramProfile = {
    id: string;
    username: string | null;
    followersCount: number;
    mediaCount: number;
  };

  const isNonexistentUsernameError = (message: string): boolean => {
    const normalized = message.toLowerCase();
    return normalized.includes("nonexistent field") && normalized.includes("username");
  };

  const fetchInstagramProfile = async (accountId: string): Promise<InstagramProfile> => {
    const accountUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${accountId}`);
    accountUrl.searchParams.set("fields", "id,username,followers_count,media_count");

    const accountResponse = await fetch(accountUrl, { headers: baseHeaders, cache: "no-store" });
    if (!accountResponse.ok) {
      throw new Error(
        `Meta Instagram profile error (${accountResponse.status}): ${await parseErrorBody(accountResponse)}`
      );
    }

    const accountData = (await safeJson<{
      id?: string;
      username?: string;
      followers_count?: string | number;
      media_count?: string | number;
    }>(accountResponse, "Instagram profile")) as {
      id?: string;
      username?: string;
      followers_count?: string | number;
      media_count?: string | number;
    };

    const id = String(accountData.id ?? "").trim();
    if (!id) {
      throw new Error("Meta Instagram profile error: response did not include an id.");
    }

    return {
      id,
      username: typeof accountData.username === "string" ? accountData.username : null,
      followersCount: readNumber(accountData.followers_count),
      mediaCount: readNumber(accountData.media_count),
    };
  };

  const resolveInstagramProfileViaPage = async (
    pageId: string
  ): Promise<InstagramProfile | null> => {
    const normalizedPageId = pageId.trim();
    if (!normalizedPageId) return null;

    const pageUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${normalizedPageId}`);
    pageUrl.searchParams.set(
      "fields",
      "instagram_business_account{id,username,followers_count,media_count},connected_instagram_account{id,username,followers_count,media_count}"
    );

    const pageResponse = await fetch(pageUrl, { headers: baseHeaders, cache: "no-store" });
    if (!pageResponse.ok) {
      return null;
    }

    const pageData = (await safeJson<{
      instagram_business_account?: {
        id?: string;
        username?: string;
        followers_count?: string | number;
        media_count?: string | number;
      } | null;
      connected_instagram_account?: {
        id?: string;
        username?: string;
        followers_count?: string | number;
        media_count?: string | number;
      } | null;
    }>(pageResponse, "Instagram profile via page")) as {
      instagram_business_account?: {
        id?: string;
        username?: string;
        followers_count?: string | number;
        media_count?: string | number;
      } | null;
      connected_instagram_account?: {
        id?: string;
        username?: string;
        followers_count?: string | number;
        media_count?: string | number;
      } | null;
    };

    const candidate =
      pageData.instagram_business_account ?? pageData.connected_instagram_account ?? null;
    const id = String(candidate?.id ?? "").trim();
    if (!id) return null;

    return {
      id,
      username: typeof candidate?.username === "string" ? candidate.username : null,
      followersCount: readNumber(candidate?.followers_count),
      mediaCount: readNumber(candidate?.media_count),
    };
  };

  let resolvedProfile: InstagramProfile | null =
    options?.pageId?.trim() ? await resolveInstagramProfileViaPage(options.pageId) : null;

  if (!resolvedProfile) {
    try {
      resolvedProfile = await fetchInstagramProfile(configuredAccountId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isNonexistentUsernameError(message)) {
        resolvedProfile = await resolveInstagramProfileViaPage(configuredAccountId);
      } else {
        throw error;
      }
    }
  }

  if (!resolvedProfile) {
    throw new Error(
      "Meta Instagram configuration error: META_INSTAGRAM_ACCOUNT_ID is not an Instagram Business Account ID. Set META_PAGE_ID (or connect a Meta Page) so Imladris can resolve the linked instagram_business_account, or update the configured Instagram Account ID."
    );
  }

  const mediaUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${resolvedProfile.id}/media`
  );
  mediaUrl.searchParams.set(
    "fields",
    "id,caption,timestamp,like_count,comments_count,media_type,media_product_type,permalink,thumbnail_url"
  );
  
  const fromTime = Math.floor((from || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).getTime() / 1000);
  const toTime = Math.floor((to || new Date()).getTime() / 1000);
  mediaUrl.searchParams.set("since", fromTime.toString());
  mediaUrl.searchParams.set("until", toTime.toString());
  
  mediaUrl.searchParams.set("limit", "100");

  const mediaPageResult = await fetchMetaGraphPages<{
    id?: string;
    caption?: string;
    timestamp?: string;
    like_count?: string | number;
    comments_count?: string | number;
    media_type?: string;
    media_product_type?: string;
    permalink?: string;
    thumbnail_url?: string;
  }>({
    url: mediaUrl,
    headers: baseHeaders,
    label: "Meta Instagram media",
  });
  const mediaRows = mediaPageResult.rows;

  const insightsUrl = new URL(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/${resolvedProfile.id}/insights`
  );
  insightsUrl.searchParams.set("metric", "reach,profile_views,website_clicks");
  insightsUrl.searchParams.set("period", "day");
  insightsUrl.searchParams.set("since", fromTime.toString());
  insightsUrl.searchParams.set("until", toTime.toString());
  let reach30d = 0;
  let traffic = 0;
  let clicks = 0;
  try {
    const insightsResponse = await fetch(insightsUrl, { headers: baseHeaders, cache: "no-store" });
    if (insightsResponse.ok) {
      const insightsData = (await safeJson<{
        data?: MetaPageInsightMetric[];
      }>(insightsResponse, "Meta Instagram insights")) as {
        data?: MetaPageInsightMetric[];
      };
      for (const metric of insightsData.data ?? []) {
        const value = (metric.values ?? []).reduce((sum, item) => sum + readNumber(item.value), 0);
        if (metric.name === "reach") reach30d = value;
        if (metric.name === "profile_views") traffic = value;
        if (metric.name === "website_clicks") clicks = value;
      }
    }
  } catch {
    // Instagram account insights are not available for every Meta token/account.
  }

  const media = scoreInstagramPosts(
    mediaRows
    .map((item) =>
      buildInstagramTopPost({
        id: item.id ?? "",
        caption: item.caption ?? "",
        timestamp: item.timestamp ?? "",
        likes: readNumber(item.like_count),
        comments: readNumber(item.comments_count),
        mediaType: readString(item.media_type) ?? "UNKNOWN",
        mediaProductType: readString(item.media_product_type),
        permalink: readString(item.permalink),
        thumbnailUrl: readString(item.thumbnail_url),
        followersCount: resolvedProfile.followersCount,
      })
    ),
    to ?? new Date()
  )
    .sort((left, right) => {
      if (right.performanceScore !== left.performanceScore) {
        return right.performanceScore - left.performanceScore;
      }
      return right.createdAt.localeCompare(left.createdAt);
    });

  const emptyCreativeAnalysis = {
    results: new Map(),
    analyzedCount: 0,
    totalCandidates: media.filter((post) => post.isVideo && post.thumbnailUrl).length,
    sampled: false,
  };
  const creativeAnalysisResult = await withFallback(
    enrichInstagramVideoCreatives(media, { limit: 6, concurrency: 2 }),
    emptyCreativeAnalysis,
    1500
  );
  const enrichedMedia = media.map((post) => {
    const creative = creativeAnalysisResult.results.get(post.id);
    return creative ? { ...post, ...creative } : post;
  });

  const engagement30d = enrichedMedia.reduce((sum, item) => sum + item.engagement, 0);
  const mediaTypeBreakdown = enrichedMedia.reduce(
    (summary, item) => {
      if (item.isReel) {
        summary.reel += 1;
      } else if (item.isCarousel) {
        summary.carousel += 1;
      } else if (item.isVideo) {
        summary.video += 1;
      } else if (item.mediaType === "IMAGE") {
        summary.image += 1;
      } else {
        summary.other += 1;
      }
      return summary;
    },
    { image: 0, video: 0, reel: 0, carousel: 0, other: 0 }
  );
  const creativeAnalysis = {
    analyzedVideos: creativeAnalysisResult.analyzedCount,
    totalVideoCandidates: creativeAnalysisResult.totalCandidates,
    sampled: creativeAnalysisResult.sampled,
  };
  const attributeCorrelations = buildInstagramAttributeCorrelations(
    enrichedMedia,
    creativeAnalysis
  );
  const explainedMedia = buildInstagramOptimizationIdeas(
    buildInstagramPerformanceDrivers(
      enrichedMedia,
      attributeCorrelations
    ),
    attributeCorrelations
  );
  const winningPatterns = buildInstagramWinningPatterns(attributeCorrelations);
  const losingPatterns = buildInstagramLosingPatterns(attributeCorrelations);
  const topPosts = explainedMedia.slice(0, 5);
  const topVideos = explainedMedia
    .filter((item) => item.isVideo)
    .slice(0, 5);
  const videosToImprove = buildInstagramVideosToImprove(explainedMedia);
  const opportunities = buildInstagramOpportunities(attributeCorrelations);
  const testBacklog = buildInstagramTestBacklog(topVideos);
  const experimentPlan = buildInstagramExperimentPlan(topVideos, testBacklog);

  const meta = makeMeta("live");
  meta.truncated = mediaPageResult.truncated;
  meta.truncatedResources = mediaPageResult.truncated ? ["media"] : [];

  return {
    followers: resolvedProfile.followersCount,
    reach30d,
    engagement30d,
    traffic,
    bounceRate: 0,
    clicks,
    returningVisitors: 0,
    topPosts,
    topVideos,
    videosToImprove,
    mediaTypeBreakdown,
    creativeAnalysis,
    opportunities,
    experimentPlan,
    testBacklog,
    attributeCorrelations,
    winningPatterns,
    losingPatterns,
    _meta: meta,
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
  userAgent?: string | null,
  options?: { fromDate?: Date; toDate?: Date }
): Promise<RedditAdsData> {
  const normalizedUserAgent = (userAgent || process.env.REDDIT_USER_AGENT || "").trim();
  if (!normalizedUserAgent) {
    throw new Error("Reddit Ads config error: REDDIT_USER_AGENT is required.");
  }
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
    cache: "no-store",
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

  const tokenData = await safeJson<{ access_token?: string }>(tokenResponse, "Reddit token");
  const accessToken = tokenData.access_token?.trim();
  if (!accessToken) {
    throw new Error("Reddit token response did not include access_token.");
  }

  const cleanAccountId = adAccountId.trim();
  const campaignPageResult = await fetchRedditCampaigns({
    accessToken,
    adAccountId: cleanAccountId,
    baseHeaders,
  });
  const campaignNameById = new Map<string, string>();
  for (const campaign of campaignPageResult.campaigns) {
    const id = String(campaign.id ?? "").trim();
    if (!id) continue;
    campaignNameById.set(id, campaign.name || id);
  }

  const rangeFrom = options?.fromDate ?? null;
  const rangeTo = options?.toDate ?? null;
  const useRange =
    Boolean(rangeFrom && rangeTo) &&
    !Number.isNaN(rangeFrom?.getTime() ?? NaN) &&
    !Number.isNaN(rangeTo?.getTime() ?? NaN) &&
    Boolean(rangeFrom && rangeTo && rangeFrom <= rangeTo);

  const endExclusive = (() => {
    const latestSafeBoundary = startOfUtcDay(new Date());
    if (!useRange) {
      return latestSafeBoundary;
    }

    const requestedBoundary = addUtcDays(startOfUtcDay(rangeTo!), 1);
    return requestedBoundary.getTime() > latestSafeBoundary.getTime()
      ? latestSafeBoundary
      : requestedBoundary;
  })();

  const startsAtNorm = useRange
    ? startOfUtcDay(rangeFrom!)
    : addUtcDays(endExclusive, -30);
  const endsAtNorm = endExclusive;

  const startsAtIso = startsAtNorm.toISOString().replace(/\.\d{3}Z$/, "Z");
  const endsAtIso = endsAtNorm.toISOString().replace(/\.\d{3}Z$/, "Z");
  const reportMetrics = await fetchRedditReportMetrics({
    accessToken,
    adAccountId: cleanAccountId,
    baseHeaders,
    startsAtIso,
    endsAtIso,
  });

  let totalSpend = 0;
  let totalImpressions = 0;
  let totalClicks = 0;
  let totalConversions = 0;
  const campaignRollup = new Map<string, { spend: number; impressions: number; clicks: number; conversions: number }>();

  for (const metricRaw of reportMetrics) {
    const metric = asRecord(metricRaw);
    if (!metric) continue;
    const campaignId = extractRedditCampaignId(metric) || "unknown";
    const spend = extractRedditSpend(metric);
    const impressions = readNumber(metric.impressions ?? metric.IMPRESSIONS);
    const clicks = readNumber(metric.clicks ?? metric.CLICKS);
    const conversions =
      readNumber(
        metric.key_conversion_total_count ??
          metric.KEY_CONVERSION_TOTAL_COUNT ??
          metric.reddit_leads ??
          metric.REDDIT_LEADS
      ) ||
      (readNumber(metric.conversion_lead_count ?? metric.CONVERSION_LEAD_COUNT) +
        readNumber(metric.conversion_purchase_count ?? metric.CONVERSION_PURCHASE_COUNT) +
        readNumber(metric.conversion_sign_up_count ?? metric.CONVERSION_SIGN_UP_COUNT) +
        readNumber(metric.conversion_custom_count ?? metric.CONVERSION_CUSTOM_COUNT));

    totalSpend += spend;
    totalImpressions += impressions;
    totalClicks += clicks;
    totalConversions += conversions;

    const existing = campaignRollup.get(campaignId) ?? { spend: 0, impressions: 0, clicks: 0, conversions: 0 };
    existing.spend += spend;
    existing.impressions += impressions;
    existing.clicks += clicks;
    existing.conversions += conversions;
    campaignRollup.set(campaignId, existing);
  }

  const campaigns: AdCampaign[] = Array.from(campaignRollup.entries()).map(([campaignId, data]) => {
    const ctr = data.impressions > 0 ? (data.clicks / data.impressions) * 100 : 0;
    const cpc = data.clicks > 0 ? data.spend / data.clicks : 0;
    return {
      campaignId,
      adAccountId: cleanAccountId || undefined,
      name: campaignNameById.get(campaignId) || campaignId,
      spend: data.spend,
      impressions: data.impressions,
      clicks: data.clicks,
      conversions: data.conversions,
      ctr,
      cpc,
    };
  });

  const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const cpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const cpa = totalConversions > 0 ? totalSpend / totalConversions : 0;

  const meta = makeMeta("live");
  meta.truncated = campaignPageResult.truncated;
  meta.truncatedResources = campaignPageResult.truncated ? ["campaigns"] : [];

  return {
    totalSpend30d: totalSpend,
    totalImpressions,
    totalClicks,
    totalConversions,
    cpa,
    ctr,
    cpc,
    campaigns,
    _meta: meta,
  };
}
