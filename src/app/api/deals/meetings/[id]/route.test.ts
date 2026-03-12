import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/lib/permissions", () => ({
  enforcePermission: vi.fn(async () => ({ role: "member" })),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    dealMeeting: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

describe("deal meeting detail route", () => {
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

  it("returns transcript and analysis fields for the meeting detail response", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.dealMeeting.findUnique).mockResolvedValue({
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
      attendees: [
        {
          id: "contact-1",
          firstName: "Avery",
          lastName: "Buyer",
          email: "avery@acme.com",
        },
      ],
    } as never);

    const { GET } = await import("@/app/api/deals/meetings/[id]/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/meetings/meeting-1"), {
      params: Promise.resolve({ id: "meeting-1" }),
    });
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(
      expect.objectContaining({
        id: "meeting-1",
        googleDriveFileId: "file-1",
        googleDriveFileName: "Acme Demo Transcript",
        googleDriveFileUrl: "https://drive.google.com/file/d/file-1/view",
        transcriptMatchConfidence: 0.92,
        analysisArtifactId: "artifact-1",
        demoQualityScore: 86,
        demoQualitySummary: "Handled discovery well and closed on next steps.",
        demoStrengthsJson: ["Strong discovery", "Clear next steps"],
        demoGapsJson: ["Pricing objection handling"],
      })
    );
  });

  it("returns a 404 when the meeting is missing", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.dealMeeting.findUnique).mockResolvedValue(null as never);

    const { GET } = await import("@/app/api/deals/meetings/[id]/route");
    const response = await GET(new NextRequest("http://localhost/api/deals/meetings/missing"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Meeting not found" });
  });
});
