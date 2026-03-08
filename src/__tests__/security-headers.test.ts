import { describe, expect, it } from "vitest";

describe("Security Headers Configuration", () => {
  it("exports a headers function for all routes", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;

    expect(nextConfig).toBeDefined();
    expect(typeof nextConfig.headers).toBe("function");

    const headersConfig = await nextConfig.headers!();
    expect(headersConfig).toHaveLength(1);
    expect(headersConfig[0].source).toBe("/(.*)");
  });

  it("includes the expected security headers", async () => {
    const configModule = await import("../../next.config");
    const nextConfig = configModule.default;
    const headersConfig = await nextConfig.headers!();
    const headers = headersConfig[0].headers;

    const csp = headers.find((header) => header.key === "Content-Security-Policy");
    const hsts = headers.find((header) => header.key === "Strict-Transport-Security");
    const xcto = headers.find((header) => header.key === "X-Content-Type-Options");
    const xfo = headers.find((header) => header.key === "X-Frame-Options");
    const xxss = headers.find((header) => header.key === "X-XSS-Protection");
    const referrer = headers.find((header) => header.key === "Referrer-Policy");
    const permissions = headers.find((header) => header.key === "Permissions-Policy");

    expect(csp?.value).toContain("default-src 'self'");
    expect(csp?.value).toContain("script-src");
    expect(csp?.value).toContain("frame-ancestors 'none'");
    expect(csp?.value).toContain("object-src 'none'");
    expect(csp?.value).toContain("upgrade-insecure-requests");
    expect(hsts?.value).toContain("max-age=31536000");
    expect(hsts?.value).toContain("includeSubDomains");
    expect(xcto?.value).toBe("nosniff");
    expect(xfo?.value).toBe("DENY");
    expect(xxss?.value).toBe("0");
    expect(referrer?.value).toBe("strict-origin-when-cross-origin");
    expect(permissions?.value).toContain("camera=()");
    expect(permissions?.value).toContain("microphone=()");
    expect(permissions?.value).toContain("geolocation=()");
    expect(headers).toHaveLength(7);
  });
});
