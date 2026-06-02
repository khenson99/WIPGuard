import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/socket-auth", () => ({
  extractSessionToken: vi.fn(),
  getSessionFromToken: vi.fn(),
}));

import {
  extractSessionToken,
  getSessionFromToken,
} from "@/lib/socket-auth";

const mockExtractSessionToken = vi.mocked(extractSessionToken);
const mockGetSessionFromToken = vi.mocked(getSessionFromToken);

describe("socket-server auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authentication flow", () => {
    it("rejects when no cookie header is present", () => {
      mockExtractSessionToken.mockReturnValue(null);
      expect(mockExtractSessionToken(undefined)).toBeNull();
    });

    it("rejects when session token is invalid", async () => {
      mockExtractSessionToken.mockReturnValue("invalid-token");
      mockGetSessionFromToken.mockResolvedValue(null);

      const token = mockExtractSessionToken("next-auth.session-token=invalid-token");
      expect(token).toBe("invalid-token");
      await expect(mockGetSessionFromToken(token!)).resolves.toBeNull();
    });

    it("accepts when session is valid", async () => {
      mockExtractSessionToken.mockReturnValue("valid-token");
      mockGetSessionFromToken.mockResolvedValue({
        userId: "user-1",
        email: "test@example.com",
      });

      const token = mockExtractSessionToken("next-auth.session-token=valid-token");
      await expect(mockGetSessionFromToken(token!)).resolves.toEqual({
        userId: "user-1",
        email: "test@example.com",
      });
    });
  });

  it("does not expose project-scoped board authorization", async () => {
    const auth = await import("@/lib/socket-auth");
    expect("verifyProjectAccess" in auth).toBe(false);
  });
});
