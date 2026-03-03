import {
  extractVersionFromPath,
  isVersionSupported,
  isVersionDeprecated,
  resolveVersionedPath,
  addVersionHeaders,
  versionedResponse,
  versionedErrorResponse,
  CURRENT_API_VERSION,
  API_VERSIONS,
} from "../versioning";
import { NextResponse } from "next/server";

describe("API Versioning", () => {
  describe("extractVersionFromPath", () => {
    it("extracts v1 from versioned path", () => {
      expect(extractVersionFromPath("/api/v1/tasks")).toBe("v1");
    });

    it("extracts v1 from nested versioned path", () => {
      expect(extractVersionFromPath("/api/v1/integrations/hubspot/webhook")).toBe("v1");
    });

    it("returns current version for unversioned path", () => {
      expect(extractVersionFromPath("/api/tasks")).toBe(CURRENT_API_VERSION);
    });

    it("returns current version for unsupported version", () => {
      expect(extractVersionFromPath("/api/v99/tasks")).toBe(CURRENT_API_VERSION);
    });

    it("returns current version for root api path", () => {
      expect(extractVersionFromPath("/api/")).toBe(CURRENT_API_VERSION);
    });
  });

  describe("isVersionSupported", () => {
    it("returns true for v1", () => {
      expect(isVersionSupported("v1")).toBe(true);
    });

    it("returns false for unsupported version", () => {
      expect(isVersionSupported("v99")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(isVersionSupported("")).toBe(false);
    });
  });

  describe("isVersionDeprecated", () => {
    it("returns false for v1 (not deprecated)", () => {
      expect(isVersionDeprecated(API_VERSIONS.V1)).toBe(false);
    });
  });

  describe("resolveVersionedPath", () => {
    it("adds version to unversioned path", () => {
      expect(resolveVersionedPath("/api/tasks")).toBe("/api/v1/tasks");
    });

    it("leaves versioned path unchanged", () => {
      expect(resolveVersionedPath("/api/v1/tasks")).toBe("/api/v1/tasks");
    });

    it("handles nested paths", () => {
      expect(resolveVersionedPath("/api/integrations/hubspot/webhook")).toBe(
        "/api/v1/integrations/hubspot/webhook"
      );
    });
  });

  describe("addVersionHeaders", () => {
    it("adds API-Version header", () => {
      const response = NextResponse.json({ ok: true });
      const versioned = addVersionHeaders(response, "v1");
      expect(versioned.headers.get("API-Version")).toBe("v1");
    });

    it("defaults to current version", () => {
      const response = NextResponse.json({ ok: true });
      const versioned = addVersionHeaders(response);
      expect(versioned.headers.get("API-Version")).toBe(CURRENT_API_VERSION);
    });
  });

  describe("versionedResponse", () => {
    it("creates a JSON response with version header", async () => {
      const response = versionedResponse({ data: "test" }, "v1");
      expect(response.headers.get("API-Version")).toBe("v1");
      const body = await response.json();
      expect(body).toEqual({ data: "test" });
    });

    it("accepts custom status via init", () => {
      const response = versionedResponse({ created: true }, "v1", { status: 201 });
      expect(response.status).toBe(201);
      expect(response.headers.get("API-Version")).toBe("v1");
    });
  });

  describe("versionedErrorResponse", () => {
    it("creates an error response with version header", async () => {
      const response = versionedErrorResponse("Not found", 404, "v1");
      expect(response.status).toBe(404);
      expect(response.headers.get("API-Version")).toBe("v1");
      const body = await response.json();
      expect(body).toEqual({ error: "Not found" });
    });

    it("defaults to 500 status", () => {
      const response = versionedErrorResponse("Internal error");
      expect(response.status).toBe(500);
    });
  });

  describe("CURRENT_API_VERSION", () => {
    it("is v1", () => {
      expect(CURRENT_API_VERSION).toBe("v1");
    });
  });
});
