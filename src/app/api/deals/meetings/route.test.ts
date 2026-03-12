import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "member" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealMeeting: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

describe("deal meetings route", () => {
  beforeEach(async () => {
    vi.resetAllMocks();

    const { auth } = await import("@/lib/auth");
    vi.mocked(auth).mockResolvedValue({
      user: {
        id: "user-1",
        email: "user@example.com",
      },
    } as never);
  });

  it("returns transcript and analysis fields in the meetings list", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.dealMeeting.findMany).mockResolvedValue([
      {
        id: "meeting-1",
        title: "Acme demo",
        googleDriveFileId: "file-1",
        googleDriveFileName: "Acme Demo Transcript",
        googleDriveFileUrl: "https://drive.google.com/file/d/file-1/view",
        transcriptMatchedAt: new Date("2026-03-11T18:00:00.000Z"),
        transcriptMatchConfidence: 0.92,
        analysisArtifactId: "artifact-1",
        demoQualityScore: 86,
        demoQualitySummary: "Handled discovery well and closed on next steps.",
        demoStrengthsJson: ["Strong discovery", "Clear next steps"],
        demoGapsJson: ["Pricing objection handling"],
        analyzedAt: new Date("2026-03-11T19:00:00.000Z"),
        deal: { id: "deal-1", name: "Acme" },
        company: { id: "company-1", name: "Acme Corp" },
        _count: { attendees: 3 },
      },
      {
        id: "meeting-2",
        title: "Beta follow-up",
        googleDriveFileId: null,
        googleDriveFileName: null,
        googleDriveFileUrl: null,
        transcriptMatchedAt: null,
        transcriptMatchConfidence: null,
        analysisArtifactId: null,
        demoQualityScore: null,
        demoQualitySummary: null,
        demoStrengthsJson: null,
        demoGapsJson: null,
        analyzedAt: null,
        deal: { id: "deal-2", name: "Beta" },
        company: { id: "company-2", name: "Beta LLC" },
        _count: { attendees: 1 },
      },
    ] as never);

    const { GET } = await import("@/app/api/deals/meetings/route");
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual([
      expect.objectContaining({
        id: "meeting-1",
        googleDriveFileId: "file-1",
        transcriptMatchConfidence: 0.92,
        analysisArtifactId: "artifact-1",
        demoQualityScore: 86,
        demoQualitySummary: "Handled discovery well and closed on next steps.",
        demoStrengthsJson: ["Strong discovery", "Clear next steps"],
        demoGapsJson: ["Pricing objection handling"],
      }),
      expect.objectContaining({
        id: "meeting-2",
        googleDriveFileId: null,
        transcriptMatchConfidence: null,
        analysisArtifactId: null,
        demoQualityScore: null,
        demoQualitySummary: null,
        demoStrengthsJson: null,
        demoGapsJson: null,
      }),
    ]);
  });
});
