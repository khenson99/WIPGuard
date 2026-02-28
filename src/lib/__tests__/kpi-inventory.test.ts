import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("kpi-inventory script", () => {
  it("runs and produces inventory outputs", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const outDir = path.join(os.tmpdir(), `wipguard-kpi-inventory-${Date.now()}`);

    const result = spawnSync(process.execPath, ["scripts/kpi-inventory.mjs", "--outDir", outDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const jsonPath = path.join(outDir, "kpi-inventory.json");
    const mdPath = path.join(outDir, "kpi-inventory.md");

    expect(fs.existsSync(jsonPath)).toBe(true);
    expect(fs.existsSync(mdPath)).toBe(true);

    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { occurrences?: unknown[] };
    expect(Array.isArray(parsed.occurrences)).toBe(true);
    expect(parsed.occurrences!.length).toBeGreaterThan(0);
  });
});

