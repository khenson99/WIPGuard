import { describe, expect, it } from "vitest";
import { IntegrationProvider } from "@/generated/prisma/client";
import { buildImladrisRawRecordsFromPayload } from "@/lib/imladris/raw-records";

describe("Linear project raw records", () => {
  it("stores synced Linear projects as project raw records", () => {
    const records = buildImladrisRawRecordsFromPayload({
      provider: IntegrationProvider.LINEAR,
      snapshotKey: "linear",
      from: "2026-05-01T00:00:00.000Z",
      to: "2026-06-01T00:00:00.000Z",
      capturedAt: new Date("2026-06-01T12:00:00.000Z"),
      payload: {
        projects: [
          {
            id: "project_1",
            name: "Launch self-serve onboarding",
            state: "started",
            updatedAt: "2026-05-31T00:00:00.000Z",
            completedIssueCount: 2,
            totalIssueCount: 3,
            progressPct: 66.67,
          },
        ],
      },
    });

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({
        objectType: "project",
        externalId: "linear:project:project_1",
        sourceUpdatedAt: "2026-05-31T00:00:00.000Z",
        payload: expect.objectContaining({
          id: "project_1",
          progressPct: 66.67,
          snapshotKey: "linear",
        }),
      }),
    ]));
  });
});
