import { describe, expect, it } from "vitest";
import { buildDefaultConferenceSlug, slugify } from "@/lib/conferences/slug";

describe("conference slug utilities", () => {
  it("slugifies names and removes punctuation", () => {
    expect(slugify("SaaStr Annual 2026!")).toBe("saastr-annual-2026");
    expect(slugify("  O'Reilly AI  ")).toBe("oreilly-ai");
  });

  it("falls back to 'conference' when input is empty", () => {
    expect(slugify("   ")).toBe("conference");
    expect(slugify("")).toBe("conference");
  });

  it("builds default slug with year suffix", () => {
    const slug = buildDefaultConferenceSlug({
      name: "SaaStr Annual",
      startDate: new Date("2026-09-10T00:00:00Z"),
    });

    expect(slug).toBe("saastr-annual-2026");
  });
});

