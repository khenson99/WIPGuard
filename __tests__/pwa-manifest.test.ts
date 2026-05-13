import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

describe("PWA manifest", () => {
  it("uses Imladris branding and declares Android install icons that exist", () => {
    const manifestPath = path.join(rootDir, "public", "manifest.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

    expect(manifest.name).toBe("Imladris");
    expect(manifest.short_name).toBe("Imladris");
    expect(manifest.description).toContain("analytics API meeting place");
    expect(manifest.theme_color).toBe("#FC5A29");
    expect(manifest.background_color).toBe("#FFFFFF");
    expect(manifest.icons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" }),
        expect.objectContaining({
          src: "/icons/icon-512-maskable.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        }),
      ]),
    );

    for (const iconPath of ["/icons/icon-192.png", "/icons/icon-512.png", "/icons/icon-512-maskable.png"]) {
      expect(existsSync(path.join(rootDir, "public", iconPath))).toBe(true);
    }
  });

  it("exposes the manifest from the App Router metadata", () => {
    const layoutSource = readFileSync(path.join(rootDir, "src/app/layout.tsx"), "utf8");

    expect(layoutSource).toMatch(/applicationName:\s*"Imladris"/);
    expect(layoutSource).toMatch(/manifest:\s*"\/manifest\.json"/);
  });
});
