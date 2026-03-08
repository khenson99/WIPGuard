import OpenAI from "openai";
import type {
  FunctionTool,
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseItem,
  Tool,
} from "openai/resources/responses/responses";
import { renderTemplatedString } from "@/lib/automations/graph";
import type { AutomationResultEnvelope } from "@/lib/automations/store";

interface BuildAutomationAiRequestInput {
  nodeKey: string;
  nodeLabel: string;
  actionType: string;
  config: Record<string, unknown>;
  context: Record<string, unknown>;
  metadata?: Record<string, string>;
}

interface ParsedToolDefinition {
  name: string;
  actionType: string;
  recommendationType: string;
  title?: string;
  summary?: string;
  requiresApproval?: boolean;
}

let openAiClient: OpenAI | null = null;

function getOpenAiClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  if (!openAiClient) {
    openAiClient = new OpenAI({
      apiKey,
      webhookSecret: process.env.OPENAI_WEBHOOK_SECRET?.trim() || undefined,
    });
  }

  return openAiClient;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function renderMaybeTemplate(
  value: unknown,
  context: Record<string, unknown>
): string | null {
  if (typeof value !== "string") return null;
  const rendered = renderTemplatedString(value, context).trim();
  return rendered.length > 0 ? rendered : null;
}

function getDefaultAutomationInstructions(input: {
  nodeLabel: string;
  actionType: string;
}): string {
  return [
    "You are an internal Arda GTM operator.",
    `You are completing the workflow node "${input.nodeLabel}" (${input.actionType}).`,
    "Return JSON that matches the requested schema.",
    "Artifacts should be durable outputs such as memos, briefs, scorecards, or drafts.",
    "Recommendations should be executable next steps with concrete action payloads.",
    "Do not fabricate ids, URLs, or timestamps unless they are supported by the provided context.",
  ].join("\n");
}

function toMetadataValue(value: unknown): string {
  if (typeof value === "string") return value.slice(0, 512);
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value).slice(0, 512);
  }
  return JSON.stringify(value).slice(0, 512);
}

function buildDefaultEnvelopeSchema(): Record<string, unknown> {
  const looseObject = {
    type: "object",
    additionalProperties: true,
  } as const;

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      sourceDocuments: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            documentType: { type: "string" },
            title: { type: "string" },
            mimeType: { type: "string" },
            sourceUrl: { type: "string" },
            textContent: { type: "string" },
            structuredData: looseObject,
            metadata: looseObject,
            dedupeKey: { type: "string" },
          },
          required: ["documentType"],
        },
      },
      artifacts: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            sourceDocumentId: { type: "string" },
            artifactType: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            content: { type: "string" },
            contentJson: looseObject,
            metadata: looseObject,
            dedupeKey: { type: "string" },
          },
          required: ["artifactType", "title"],
        },
      },
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            artifactId: { type: "string" },
            recommendationType: { type: "string" },
            title: { type: "string" },
            summary: { type: "string" },
            detail: { type: "string" },
            actionType: { type: "string" },
            actionPayload: looseObject,
            requiresApproval: { type: "boolean" },
            priority: { type: "string" },
            dueAt: { type: "string" },
            metadata: looseObject,
            dedupeKey: { type: "string" },
          },
          required: ["recommendationType", "title", "summary", "actionType"],
        },
      },
    },
    required: ["artifacts", "recommendations"],
  };
}

function normalizeToolDefinitions(
  value: unknown
): { tools: Tool[]; parsedDefinitions: ParsedToolDefinition[] } {
  if (!Array.isArray(value)) {
    return { tools: [], parsedDefinitions: [] };
  }

  const tools: Tool[] = [];
  const parsedDefinitions: ParsedToolDefinition[] = [];

  for (const candidate of value) {
    const record = asRecord(candidate);
    if (!record) continue;

    if (record.type === "function") {
      const name = asString(record.name);
      const description = asString(record.description);
      const parameters = asRecord(record.parameters) ?? { type: "object", properties: {} };

      if (!name || !description) continue;

      const tool: FunctionTool = {
        type: "function",
        name,
        description,
        parameters,
        strict: true,
      };
      tools.push(tool);
      parsedDefinitions.push({
        name,
        actionType: asString(record.actionType) ?? name,
        recommendationType: asString(record.recommendationType) ?? "function_call",
        title: asString(record.title) ?? undefined,
        summary: description,
        requiresApproval: typeof record.requiresApproval === "boolean" ? record.requiresApproval : undefined,
      });
      continue;
    }

    const name = asString(record.name);
    const description = asString(record.description);
    const parameters = asRecord(record.parameters) ?? { type: "object", properties: {} };

    if (!name || !description) continue;

    const tool: FunctionTool = {
      type: "function",
      name,
      description,
      parameters,
      strict: true,
    };
    tools.push(tool);
    parsedDefinitions.push({
      name,
      actionType: asString(record.actionType) ?? name,
      recommendationType: asString(record.recommendationType) ?? "function_call",
      title: asString(record.title) ?? undefined,
      summary: description,
      requiresApproval: typeof record.requiresApproval === "boolean" ? record.requiresApproval : undefined,
    });
  }

  return { tools, parsedDefinitions };
}

export function buildAutomationAiResponseRequest(
  input: BuildAutomationAiRequestInput
): {
  request: ResponseCreateParamsNonStreaming;
  parsedToolDefinitions: ParsedToolDefinition[];
} {
  const model =
    asString(input.config.model) ??
    process.env.OPENAI_AUTOMATION_MODEL?.trim() ??
    "gpt-4.1-mini";

  const instructions =
    renderMaybeTemplate(input.config.instructionsTemplate, input.context) ??
    renderMaybeTemplate(input.config.systemPrompt, input.context) ??
    getDefaultAutomationInstructions({
      nodeLabel: input.nodeLabel,
      actionType: input.actionType,
    });

  const promptText =
    renderMaybeTemplate(input.config.inputTemplate, input.context) ??
    renderMaybeTemplate(input.config.promptTemplate, input.context) ??
    [
      `Node key: ${input.nodeKey}`,
      `Action type: ${input.actionType}`,
      "Workflow execution context:",
      JSON.stringify(input.context, null, 2),
    ].join("\n\n");

  const schema =
    asRecord(input.config.outputSchema) ??
    buildDefaultEnvelopeSchema();

  const metadataEntries = Object.entries(input.metadata ?? {}).slice(0, 16);
  const metadata =
    metadataEntries.length > 0
      ? Object.fromEntries(metadataEntries.map(([key, value]) => [key, toMetadataValue(value)]))
      : undefined;

  const { tools, parsedDefinitions } = normalizeToolDefinitions(input.config.tools);

  const request: ResponseCreateParamsNonStreaming = {
    model,
    background: true,
    store: true,
    instructions,
    input: promptText,
    max_output_tokens:
      typeof input.config.maxOutputTokens === "number" &&
      Number.isFinite(input.config.maxOutputTokens)
        ? Math.max(256, Math.trunc(input.config.maxOutputTokens))
        : 4_000,
    parallel_tool_calls:
      typeof input.config.parallelToolCalls === "boolean"
        ? input.config.parallelToolCalls
        : true,
    temperature:
      typeof input.config.temperature === "number" &&
      Number.isFinite(input.config.temperature)
        ? input.config.temperature
        : 0.2,
    metadata,
    text: {
      format: {
        type: "json_schema",
        name: `${input.nodeKey}_result`.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64),
        description: `Structured output for automation node ${input.nodeKey}`,
        schema,
        strict: false,
      },
      verbosity:
        input.config.verbosity === "high" || input.config.verbosity === "medium"
          ? input.config.verbosity
          : "low",
    },
  };

  if (tools.length > 0) {
    request.tools = tools;
  }

  return {
    request,
    parsedToolDefinitions: parsedDefinitions,
  };
}

function parseEnvelopeJson(
  rawText: string | null | undefined
): AutomationResultEnvelope | null {
  if (!rawText) return null;

  try {
    const parsed = JSON.parse(rawText) as unknown;
    const record = asRecord(parsed);
    if (!record) return null;

    return {
      summary: asString(record.summary),
      sourceDocuments: Array.isArray(record.sourceDocuments)
        ? (record.sourceDocuments.filter((item) => asRecord(item)) as AutomationResultEnvelope["sourceDocuments"])
        : [],
      artifacts: Array.isArray(record.artifacts)
        ? (record.artifacts.filter((item) => asRecord(item)) as AutomationResultEnvelope["artifacts"])
        : [],
      recommendations: Array.isArray(record.recommendations)
        ? (record.recommendations.filter((item) => asRecord(item)) as AutomationResultEnvelope["recommendations"])
        : [],
      raw: record,
    };
  } catch {
    return null;
  }
}

function extractToolRecommendations(
  response: Response,
  parsedToolDefinitions: ParsedToolDefinition[]
): NonNullable<AutomationResultEnvelope["recommendations"]> {
  if (!Array.isArray(response.output) || parsedToolDefinitions.length === 0) {
    return [];
  }

  const byName = new Map(parsedToolDefinitions.map((definition) => [definition.name, definition] as const));
  const recommendations: NonNullable<AutomationResultEnvelope["recommendations"]> = [];

  for (const item of response.output) {
    const record = asRecord(item as unknown);
    if (!record || record.type !== "function_call") {
      continue;
    }

    const name = asString(record.name);
    if (!name) continue;

    const definition = byName.get(name);
    if (!definition) continue;

    const args = parseEnvelopeJson(asString(record.arguments))?.raw ?? {};
    const actionPayload =
      asRecord((args as Record<string, unknown>).actionPayload) ??
      (asRecord(args) ?? {});

    recommendations.push({
      recommendationType: definition.recommendationType,
      title:
        asString((args as Record<string, unknown>).title) ??
        definition.title ??
        `Execute ${name}`,
      summary:
        asString((args as Record<string, unknown>).summary) ??
        definition.summary ??
        `Execute ${name}`,
      detail: asString((args as Record<string, unknown>).detail),
      actionType: definition.actionType,
      actionPayload,
      requiresApproval: definition.requiresApproval,
      priority: asString((args as Record<string, unknown>).priority),
      dueAt: asString((args as Record<string, unknown>).dueAt),
      metadata: {
        functionName: name,
        functionCallId: asString(record.call_id),
      },
    });
  }

  return recommendations;
}

export function parseAutomationAiResponseEnvelope(input: {
  response: Response;
  parsedToolDefinitions?: ParsedToolDefinition[];
}): AutomationResultEnvelope {
  const parsedFromJson = parseEnvelopeJson(input.response.output_text);
  const toolRecommendations = extractToolRecommendations(
    input.response,
    input.parsedToolDefinitions ?? []
  );

  if (parsedFromJson) {
    return {
      ...parsedFromJson,
      recommendations: [
        ...(parsedFromJson.recommendations ?? []),
        ...toolRecommendations,
      ],
      raw: {
        ...(parsedFromJson.raw ?? {}),
        responseId: input.response.id,
        responseStatus: input.response.status,
      },
    };
  }

  if (input.response.output_text?.trim()) {
    return {
      summary: input.response.output_text.trim().slice(0, 280),
      artifacts: [
        {
          artifactType: "ai_text_output",
          title: "AI Response",
          summary: input.response.output_text.trim().slice(0, 280),
          content: input.response.output_text,
        },
      ],
      recommendations: toolRecommendations,
      raw: {
        responseId: input.response.id,
        responseStatus: input.response.status,
      },
    };
  }

  return {
    summary: null,
    artifacts: [],
    recommendations: toolRecommendations,
    raw: {
      responseId: input.response.id,
      responseStatus: input.response.status,
    },
  };
}

export function extractAutomationAiOutputText(response: Response): string | null {
  return typeof response.output_text === "string" && response.output_text.trim().length > 0
    ? response.output_text
    : null;
}

export function isTerminalAutomationAiStatus(
  status: string | null | undefined
): boolean {
  return (
    status === "completed" ||
    status === "failed" ||
    status === "cancelled" ||
    status === "incomplete"
  );
}

export async function createAutomationOpenAiResponse(
  request: ResponseCreateParamsNonStreaming
): Promise<Response> {
  return getOpenAiClient().responses.create(request);
}

export async function retrieveAutomationOpenAiResponse(
  responseId: string
): Promise<Response> {
  return getOpenAiClient().responses.retrieve(responseId);
}

export async function unwrapAutomationOpenAiWebhookEvent(
  body: string,
  headers: Headers
): Promise<Record<string, unknown>> {
  const secret = process.env.OPENAI_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return (JSON.parse(body) as Record<string, unknown>) ?? {};
  }

  return getOpenAiClient().webhooks.unwrap(body, headers) as unknown as Record<string, unknown>;
}

export type AutomationAiWebhookEvent = Awaited<
  ReturnType<typeof unwrapAutomationOpenAiWebhookEvent>
>;

export type AutomationAiResponse = Response;
export type AutomationAiResponseItem = ResponseItem;
