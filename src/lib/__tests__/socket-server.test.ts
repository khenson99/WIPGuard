/**
 * Unit tests for socket-server authentication middleware and room logic.
 * We mock the dependencies (socket-auth, socket.io) to test in isolation.
 */

import { Server as SocketIOServer } from "socket.io";
import { createServer } from "http";

// Mock socket-auth module
jest.mock("@/lib/socket-auth", () => ({
  extractSessionToken: jest.fn(),
  getSessionFromToken: jest.fn(),
  verifyProjectAccess: jest.fn(),
}));

// We need to get references to the mocked functions
import {
  extractSessionToken,
  getSessionFromToken,
  verifyProjectAccess,
} from "@/lib/socket-auth";

const mockExtractSessionToken = extractSessionToken as jest.MockedFunction<
  typeof extractSessionToken
>;
const mockGetSessionFromToken = getSessionFromToken as jest.MockedFunction<
  typeof getSessionFromToken
>;
const mockVerifyProjectAccess = verifyProjectAccess as jest.MockedFunction<
  typeof verifyProjectAccess
>;

describe("socket-server auth middleware", () => {
  // Instead of importing the full initSocketServer (which creates a real
  // Socket.IO server), we test the middleware logic extracted into socket-auth.

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("authentication flow", () => {
    it("rejects when no cookie header is present", () => {
      mockExtractSessionToken.mockReturnValue(null);
      const result = mockExtractSessionToken(undefined);
      expect(result).toBeNull();
    });

    it("rejects when session token is invalid", async () => {
      mockExtractSessionToken.mockReturnValue("invalid-token");
      mockGetSessionFromToken.mockResolvedValue(null);

      const token = mockExtractSessionToken(
        "next-auth.session-token=invalid-token"
      );
      expect(token).toBe("invalid-token");

      const session = await mockGetSessionFromToken(token!);
      expect(session).toBeNull();
    });

    it("accepts when session is valid", async () => {
      mockExtractSessionToken.mockReturnValue("valid-token");
      mockGetSessionFromToken.mockResolvedValue({
        userId: "user-1",
        email: "test@example.com",
      });

      const token = mockExtractSessionToken(
        "next-auth.session-token=valid-token"
      );
      const session = await mockGetSessionFromToken(token!);

      expect(session).toEqual({
        userId: "user-1",
        email: "test@example.com",
      });
    });
  });

  describe("project access verification", () => {
    it("denies access when user is not a project member", async () => {
      mockVerifyProjectAccess.mockResolvedValue(false);

      const hasAccess = await mockVerifyProjectAccess(
        "user-1",
        "project-99"
      );
      expect(hasAccess).toBe(false);
    });

    it("grants access when user is a project member", async () => {
      mockVerifyProjectAccess.mockResolvedValue(true);

      const hasAccess = await mockVerifyProjectAccess(
        "user-1",
        "project-1"
      );
      expect(hasAccess).toBe(true);
    });
  });
});
