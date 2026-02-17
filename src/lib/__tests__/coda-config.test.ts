import { normalizeCodaDocId } from "@/lib/integrations/coda-config";

describe("coda config", () => {
  it("returns a bare doc id unchanged", () => {
    expect(normalizeCodaDocId("dAbC1234")).toBe("dAbC1234");
  });

  it("extracts doc id from common Coda share URL formats", () => {
    expect(normalizeCodaDocId("https://coda.io/d/My-Doc_dAbC1234")).toBe("dAbC1234");
    expect(normalizeCodaDocId("https://coda.io/d/_dAbC1234")).toBe("dAbC1234");
    expect(normalizeCodaDocId("https://coda.io/d/My-Doc_dAbC1234?foo=bar")).toBe("dAbC1234");
  });

  it("extracts doc id from query parameter when present", () => {
    expect(normalizeCodaDocId("https://coda.io/apis/v1/docs?docId=dAbC1234")).toBe("dAbC1234");
  });
});
