import { extractSessionToken } from "@/lib/socket-auth";

describe("socket-auth", () => {
  describe("extractSessionToken", () => {
    it("returns null when cookie header is undefined", () => {
      expect(extractSessionToken(undefined)).toBeNull();
    });

    it("returns null when cookie header is empty string", () => {
      expect(extractSessionToken("")).toBeNull();
    });

    it("returns null when no session cookie is present", () => {
      expect(
        extractSessionToken("theme=dark; lang=en")
      ).toBeNull();
    });

    it("extracts non-secure session token", () => {
      const cookie =
        "next-auth.session-token=abc123; theme=dark";
      expect(extractSessionToken(cookie)).toBe("abc123");
    });

    it("extracts secure session token", () => {
      const cookie =
        "__Secure-next-auth.session-token=secure-xyz; other=val";
      expect(extractSessionToken(cookie)).toBe("secure-xyz");
    });

    it("prefers secure token over non-secure when both present", () => {
      const cookie =
        "next-auth.session-token=non-secure; __Secure-next-auth.session-token=secure-token";
      expect(extractSessionToken(cookie)).toBe("secure-token");
    });

    it("returns null when session token value is empty", () => {
      const cookie = "next-auth.session-token=; theme=dark";
      expect(extractSessionToken(cookie)).toBeNull();
    });
  });
});
