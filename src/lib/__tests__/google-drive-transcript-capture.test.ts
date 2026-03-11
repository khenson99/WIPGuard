import { describe, expect, it } from "vitest";
import { scoreTranscriptMatch } from "@/lib/integrations/google-drive-transcript-capture";

describe("scoreTranscriptMatch", () => {
  it("prefers direct title and deal overlap over time-only overlap", () => {
    const file = {
      id: "file-1",
      name: "Acme corp demo transcript",
      modifiedTime: "2026-03-10T18:00:00.000Z",
      owners: [{ emailAddress: "rep@acme.test" }],
    };

    const strongMatch = scoreTranscriptMatch({
      file,
      meeting: {
        id: "meeting-strong",
        title: "Acme Corp Demo",
        status: "COMPLETED",
        startAt: "2026-03-10T17:30:00.000Z",
        endAt: "2026-03-10T18:15:00.000Z",
        dealId: "deal-1",
        dealName: "Acme Corp Expansion",
        hubspotDealId: "hs-1",
        companyName: "Acme Corp",
        attendeeEmails: ["rep@acme.test"],
      },
    });

    const weakMatch = scoreTranscriptMatch({
      file,
      meeting: {
        id: "meeting-weak",
        title: "Product Demo",
        status: "COMPLETED",
        startAt: "2026-03-10T18:00:00.000Z",
        endAt: "2026-03-10T18:30:00.000Z",
        dealId: "deal-2",
        dealName: "Different Account",
        hubspotDealId: "hs-2",
        companyName: "Other Company",
        attendeeEmails: ["someone-else@test.com"],
      },
    });

    expect(strongMatch).not.toBeNull();
    expect(weakMatch).not.toBeNull();
    expect((strongMatch?.score ?? 0) > (weakMatch?.score ?? 0)).toBe(true);
    expect(strongMatch?.reasons).toContain("deal");
    expect(strongMatch?.reasons).toContain("title");
  });

  it("returns null for low-confidence time-only candidates", () => {
    const result = scoreTranscriptMatch({
      file: {
        id: "file-2",
        name: "meeting notes",
        modifiedTime: "2026-03-10T18:00:00.000Z",
      },
      meeting: {
        id: "meeting-1",
        title: "Generic Sync",
        status: "COMPLETED",
        startAt: "2026-03-10T18:00:00.000Z",
        endAt: "2026-03-10T18:30:00.000Z",
        dealId: "deal-1",
        dealName: "Different Account",
        hubspotDealId: "hs-1",
        companyName: "Other Company",
        attendeeEmails: [],
      },
    });

    expect(result).toBeNull();
  });
});
