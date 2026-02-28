import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type InventoryOccurrence = {
  kind: "ui" | "api";
  featureArea?: string;
  file: string;
  line: number;
  column: number;
  label: string | null;
  fieldPath: string | null;
  expression: string | null;
};

describe("kpi drift guard", () => {
  it("keeps KPI card values free of inline KPI math", () => {
    const repoRoot = path.resolve(__dirname, "../../..");
    const outDir = path.join(os.tmpdir(), `wipguard-kpi-drift-${Date.now()}`);

    const result = spawnSync(process.execPath, ["scripts/kpi-inventory.mjs", "--outDir", outDir], {
      cwd: repoRoot,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);

    const jsonPath = path.join(outDir, "kpi-inventory.json");
    const parsed = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as { occurrences: InventoryOccurrence[] };

    const suspicious = /(filter\s*\(|reduce\s*\(|Math\.(round|floor|min|max)\s*\(|\*\s*12\b|\*\s*100\b)/;
    const usesKpis = /\bkpis\b/;

    const offenders = parsed.occurrences
      .filter((o) => o.kind === "ui" && Boolean(o.label) && typeof o.expression === "string")
      .filter((o) => suspicious.test(o.expression!) && !usesKpis.test(o.expression!));

    if (offenders.length > 0) {
      const sample = offenders
        .slice(0, 30)
        .map((o) => `${o.file}:${o.line}:${o.column} | ${o.label} | ${o.expression}`)
        .join("\n");
      throw new Error(`Inline KPI math detected in UI metric values (expected canonical \`kpis\` usage).\n${sample}`);
    }
  });
});

