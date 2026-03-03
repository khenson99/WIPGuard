import { describe, it, expect } from "vitest";

// We test the next.config.ts headers configuration by importing and invoking it
describe("Security Headers Configuration", () => {
  it("should export a valid next config with headers function", async () => {
    // Dynamic import to handle the config module
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;

    expect(nextConfig).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("should return security headers for all routes", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;

    const headersConfig = await nextConfig.headers!();

    expect(headersConfig).toHaveLength(1);
    expect(headersConfig[0].source).toBe("/(.*)");
  });

  it("should include Content-Security-Policy header", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const csp = headers.find(
      (h: { key: string; value: string }) => h.key === "Content-Security-Policy"
    );
    expect(csp).toBeDefined();
    expect(csp!.value).toContain("default-src 'self'");
    expect(csp!.value).toContain("script-src");
    expect(csp!.value).toContain("frame-ancestors 'none'");
    expect(csp!.value).toContain("object-src 'none'");
    expect(csp!.value).toContain("upgrade-insecure-requests");
  });

  it("should include Strict-Transport-Security header", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const hsts = headers.find(
      (h: { key: string; value: string }) => h.key === "Strict-Transport-Security"
    );
    expect(hsts).toBeDefined();
    expect(hsts!.value).toContain("max-age=31536000");
    expect(hsts!.value).toContain("includeSubDomains");
  });

  it("should include X-Content-Type-Options header set to nosniff", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const xcto = headers.find(
      (h: { key: string; value: string }) => h.key === "X-Content-Type-Options"
    );
    expect(xcto).toBeDefined();
    expect(xcto!.value).toBe("nosniff");
  });

  it("should include X-Frame-Options header set to DENY", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const xfo = headers.find(
      (h: { key: string; value: string }) => h.key === "X-Frame-Options"
    );
    expect(xfo).toBeDefined();
    expect(xfo!.value).toBe("DENY");
  });

  it("should include X-XSS-Protection header set to 0", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const xxss = headers.find(
      (h: { key: string; value: string }) => h.key === "X-XSS-Protection"
    );
    expect(xxss).toBeDefined();
    expect(xxss!.value).toBe("0");
  });

  it("should include Referrer-Policy header", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const rp = headers.find(
      (h: { key: string; value: string }) => h.key === "Referrer-Policy"
    );
    expect(rp).toBeDefined();
    expect(rp!.value).toBe("strict-origin-when-cross-origin");
  });

  it("should include Permissions-Policy header", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const pp = headers.find(
      (h: { key: string; value: string }) => h.key === "Permissions-Policy"
    );
    expect(pp).toBeDefined();
    expect(pp!.value).toContain("camera=()");
    expect(pp!.value).toContain("microphone=()");
    expect(pp!.value).toContain("geolocation=()");
  });

  it("should have exactly 7 security headers configured", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    expect(headers).toHaveLength(7);
  });
});

describe("Middleware", () => {
  it("should export a middleware function", async () => {
    const middlewareModule = await import("../middleware");
    expect(typeof middlewareModule.middleware).toBe("function");
  });

  it("should export a config with matcher", async () => {
    const middlewareModule = await import("../middleware");
    expect(middlewareModule.config).toBeDefined();
    expect(middlewareModule.config.matcher).toBeDefined();
    expect(Array.isArray(middlewareModule.config.matcher)).toBe(true);
  });
});
