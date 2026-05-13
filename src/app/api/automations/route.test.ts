import { describe, expect, it, vi, beforeEach } from "vitest";
import { RETIRED_AUTOMATION_ACTION_TYPES } from "@/lib/automations/retired-actions";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/session-user", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowDefinition: {
      findMany: vi.fn(),
    },
    integrationRule: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/automations", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("filters retired workflow templates and actions from public templates", async () => {
    const { auth } = await import("@/lib/auth");
    const { getAuthenticatedUser } = await import("@/lib/session-user");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(getAuthenticatedUser).mockReturnValue({
      id: "user_1",
      email: "owner@example.com",
    } as never);
    vi.mocked(prisma.workflowDefinition.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.integrationRule.findMany).mockResolvedValue([] as never);

    const { GET } = await import("@/app/api/automations/route");
    const response = await GET();
    const payload = (await response.json()) as {
      templates: Array<{
        key: string;
        description: string;
        graph: {
          nodes?: Array<{
            config?: {
              actionTypes?: string[];
              tools?: Array<{ actionType?: string }>;
            };
          }>;
        };
      }>;
    };

    expect(response.status).toBe(200);
    expect(payload.templates.some((template) => template.key === "google-gmail-commitment")).toBe(
      false
    );
    expect(payload.templates.some((template) => template.key === "slack-unanswered-sla")).toBe(
      false
    );
    expect(payload.templates.some((template) => template.key === "coda-row-upsert")).toBe(false);
    expect(
      payload.templates.some((template) =>
        template.graph.nodes?.some((node) =>
          node.config?.actionTypes?.some((actionType) =>
            RETIRED_AUTOMATION_ACTION_TYPES.includes(actionType as never)
          ) ||
          node.config?.tools?.some((tool) =>
            RETIRED_AUTOMATION_ACTION_TYPES.includes(tool.actionType as never)
          )
        )
      )
    ).toBe(false);

    const dropoffTemplate = payload.templates.find(
      (template) => template.key === "funnel-dropoff-operator"
    );
    expect(dropoffTemplate?.description).not.toContain("task");
  });
});
