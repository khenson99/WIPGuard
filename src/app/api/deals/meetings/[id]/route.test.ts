import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ deniedResponse: null })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealMeeting: {
      findUnique: vi.fn(),
    },
  },
}));

describe("GET /api/deals/meetings/[id]", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.resetModules();
  });

  it("returns enriched meeting detail including transcript metadata", async () => {
    const { auth } = await import("@/lib/auth");
    const { prisma } = await import("@/lib/prisma");

    vi.mocked(auth).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.dealMeeting.findUnique).mockResolvedValue({
      id: "meeting_1",
      title: "Demo",
      status: "COMPLETED",
      startAt: new Date("2026-03-10T18:00:00.000Z"),
      endAt: new Date("2026-03-10T18:30:00.000Z"),
      location: null,
      notes: "Call notes",
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
      attendees: [
        { id: "contact_1", firstName: "Taylor", lastName: "Kim", email: "taylor@test.com" },
      ],
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
      updatedAt: new Date("2026-03-10T19:30:00.000Z"),
    } as never);

    const { GET } = await import("@/app/api/deals/meetings/[id]/route");
    const response = await GET(
      new NextRequest("http://localhost/api/deals/meetings/meeting_1"),
      { params: Promise.resolve({ id: "meeting_1" }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      id: "meeting_1",
      googleDriveFileId: "drive_1",
      transcriptMatchConfidence: 0.91,
      analysisArtifactId: "artifact_1",
      demoQualityScore: 87,
      attendees: [
        expect.objectContaining({
          id: "contact_1",
          email: "taylor@test.com",
        }),
      ],
    });
  });
});
