import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealMeeting: {
      findMany: vi.fn(),
    },
  },
}));

describe("GET /api/deals/meetings", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns transcript and analysis fields on meetings", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.dealMeeting.findMany).mockResolvedValue([
      {
        id: "meeting_1",
        title: "Demo",
        status: "COMPLETED",
        startAt: new Date("2026-03-10T18:00:00.000Z"),
        endAt: new Date("2026-03-10T18:30:00.000Z"),
        location: null,
        notes: null,
        googleDriveFileId: "drive_1",
        googleDriveFileName: "demo transcript",
        googleDriveFileUrl: "https://drive.test/file",
        transcriptMatchedAt: new Date("2026-03-10T19:00:00.000Z"),
        transcriptMatchConfidence: 0.91,
        analysisArtifactId: "artifact_1",
        demoQualityScore: 87,
        demoQualitySummary: "Strong demo",
        demoStrengthsJson: ["Discovery"],
        demoGapsJson: ["Pricing"],
        analyzedAt: new Date("2026-03-10T19:30:00.000Z"),
        expectedAttendees: 2,
        actualAttendees: 2,
        dealId: "deal_1",
        deal: { id: "deal_1", name: "Acme" },
        companyId: "company_1",
        company: { id: "company_1", name: "Acme Co" },
        _count: { attendees: 2 },
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        updatedAt: new Date("2026-03-10T19:30:00.000Z"),
      },
    ] as never);

    const { GET } = await import("@/app/api/deals/meetings/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body[0]).toMatchObject({
      id: "meeting_1",
      googleDriveFileId: "drive_1",
      googleDriveFileName: "demo transcript",
      analysisArtifactId: "artifact_1",
      demoQualityScore: 87,
      demoQualitySummary: "Strong demo",
    });
  });
});
