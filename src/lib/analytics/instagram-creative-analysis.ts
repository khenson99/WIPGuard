import OpenAI from "openai";
import type { ChatCompletionContentPart } from "openai/resources/chat/completions/completions";
import type { InstagramTopPost } from "./types";

type CreativeSignalResult = Pick<
  InstagramTopPost,
  | "creativeSummary"
  | "hasPersonVisible"
  | "hasTextOverlayVisible"
  | "looksLikeShopFloor"
  | "looksLikeProductDemo"
  | "looksEducational"
  | "looksPromotional"
>;

export interface InstagramCreativeEnrichmentResult {
  results: Map<string, CreativeSignalResult>;
  analyzedCount: number;
  totalCandidates: number;
  sampled: boolean;
}

let client: OpenAI | null = null;

function getClient(): OpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

function clampSummary(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, 220) : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function parseCreativeSignalPayload(content: string): CreativeSignalResult | null {
  try {
    const parsed = JSON.parse(content) as Record<string, unknown>;
    return {
      creativeSummary: clampSummary(parsed.creativeSummary),
      hasPersonVisible: asBoolean(parsed.hasPersonVisible),
      hasTextOverlayVisible: asBoolean(parsed.hasTextOverlayVisible),
      looksLikeShopFloor: asBoolean(parsed.looksLikeShopFloor),
      looksLikeProductDemo: asBoolean(parsed.looksLikeProductDemo),
      looksEducational: asBoolean(parsed.looksEducational),
      looksPromotional: asBoolean(parsed.looksPromotional),
    };
  } catch {
    return null;
  }
}

async function analyzeSinglePost(post: InstagramTopPost): Promise<CreativeSignalResult | null> {
  const openai = getClient();
  if (!openai || !post.thumbnailUrl) return null;

  const content: ChatCompletionContentPart[] = [
    {
      type: "text",
      text: [
        "Analyze this Instagram video creative using the caption plus thumbnail.",
        "Return only JSON with this shape:",
        '{"creativeSummary":"string","hasPersonVisible":true,"hasTextOverlayVisible":true,"looksLikeShopFloor":false,"looksLikeProductDemo":false,"looksEducational":true,"looksPromotional":false}',
        "Use null only when a trait cannot be inferred reliably.",
        `Caption: ${post.message || "(empty caption)"}`,
      ].join("\n"),
    },
    {
      type: "image_url",
      image_url: {
        url: post.thumbnailUrl,
      },
    },
  ];

  try {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_INSTAGRAM_ANALYSIS_MODEL?.trim() || "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 300,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are analyzing short-form social video creatives. Be conservative. Infer only directly observable traits from the thumbnail and caption.",
        },
        {
          role: "user",
          content,
        },
      ],
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return null;
    return parseCreativeSignalPayload(text);
  } catch {
    return null;
  }
}

export async function enrichInstagramVideoCreatives(
  posts: InstagramTopPost[],
  options?: { limit?: number; concurrency?: number }
): Promise<InstagramCreativeEnrichmentResult> {
  const candidates = posts.filter((post) => post.isVideo && post.thumbnailUrl);
  if (candidates.length === 0) {
    return {
      results: new Map(),
      analyzedCount: 0,
      totalCandidates: 0,
      sampled: false,
    };
  }
  if (!getClient()) {
    return {
      results: new Map(),
      analyzedCount: 0,
      totalCandidates: candidates.length,
      sampled: false,
    };
  }

  const limit = Math.max(1, Math.min(options?.limit ?? 8, 12));
  const concurrency = Math.max(1, Math.min(options?.concurrency ?? 3, 4));
  const queue = candidates.slice(0, limit);
  const results = new Map<string, CreativeSignalResult>();
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < queue.length) {
      const current = queue[cursor];
      cursor += 1;
      const analyzed = await analyzeSinglePost(current);
      if (analyzed) {
        results.set(current.id, analyzed);
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, () => worker()));
  return {
    results,
    analyzedCount: queue.length,
    totalCandidates: candidates.length,
    sampled: candidates.length > queue.length,
  };
}
