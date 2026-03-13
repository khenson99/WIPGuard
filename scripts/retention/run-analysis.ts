import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { runRetentionAnalysis } from "@/lib/retention/pipeline";
import { resolveRetentionActor } from "./_shared";

async function main() {
  const actor = await resolveRetentionActor();
  const results = await runRetentionAnalysis(actor);
  const outputDir = path.join(process.cwd(), "docs", "retention");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "analysis-output.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        organizationId: actor.organizationId,
        candidates: results,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  console.info(`[retention] wrote analysis results for organization ${actor.organizationId}`);
  console.table(
    results.map((result) => ({
      candidate: result.label,
      coverage: result.coverage,
      lift: result.lift,
      segmentSpread: result.segmentSpread,
      score: result.score,
    }))
  );
}

main().catch((error) => {
  console.error("[retention] analysis failed", error);
  process.exitCode = 1;
});
