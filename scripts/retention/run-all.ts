import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRetentionIdentityGapsReport,
  renderRetentionIdentityGapsMarkdown,
} from "@/lib/retention/reporting";
import {
  buildRetentionDataset,
  materializeRetentionCurrent,
  runRetentionAnalysis,
  syncRetentionSources,
} from "@/lib/retention/pipeline";
import { resolveRetentionActor } from "./_shared";

async function main() {
  const actor = await resolveRetentionActor();
  const outputDir = path.join(process.cwd(), "docs", "retention");
  await mkdir(outputDir, { recursive: true });

  await syncRetentionSources(actor);
  await buildRetentionDataset(actor);

  const analysis = await runRetentionAnalysis(actor);
  await writeFile(
    path.join(outputDir, "analysis-output.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        organizationId: actor.organizationId,
        candidates: analysis,
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  await materializeRetentionCurrent(actor);

  const gapsReport = await buildRetentionIdentityGapsReport(actor);
  await writeFile(
    path.join(outputDir, "gaps-report.json"),
    `${JSON.stringify(gapsReport, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(outputDir, "gaps-report.md"),
    renderRetentionIdentityGapsMarkdown(gapsReport),
    "utf8"
  );

  console.info(`[retention] completed full pipeline for organization ${actor.organizationId}`);
}

main().catch((error) => {
  console.error("[retention] full pipeline failed", error);
  process.exitCode = 1;
});
