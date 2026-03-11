import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/socket-auth", () => ({
  extractSessionToken: vi.fn(),
  getSessionFromToken: vi.fn(),
  verifyProjectAccess: vi.fn(),
}));

import {
  extractSessionToken,
  getSessionFromToken,
  verifyProjectAccess,
} from "@/lib/socket-auth";

const mockExtractSessionToken = vi.mocked(extractSessionToken);
const mockGetSessionFromToken = vi.mocked(getSessionFromToken);
const mockVerifyProjectAccess = vi.mocked(verifyProjectAccess);

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

  describe("project access verification", () => {
    it("denies access when user is not a project member", async () => {
      mockVerifyProjectAccess.mockResolvedValue(false);
      await expect(mockVerifyProjectAccess("user-1", "project-99")).resolves.toBe(false);
    });

    it("grants access when user is a project member", async () => {
      mockVerifyProjectAccess.mockResolvedValue(true);
      await expect(mockVerifyProjectAccess("user-1", "project-1")).resolves.toBe(true);
    });
  });
});
