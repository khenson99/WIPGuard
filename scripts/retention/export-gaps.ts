import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  buildRetentionIdentityGapsReport,
  renderRetentionIdentityGapsMarkdown,
} from "@/lib/retention/reporting";
import { resolveRetentionActor } from "./_shared";

async function main() {
  const actor = await resolveRetentionActor();
  const report = await buildRetentionIdentityGapsReport(actor);
  const outputDir = path.join(process.cwd(), "docs", "retention");
  await mkdir(outputDir, { recursive: true });
  await writeFile(
    path.join(outputDir, "gaps-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8"
  );
  await writeFile(
    path.join(outputDir, "gaps-report.md"),
    renderRetentionIdentityGapsMarkdown(report),
    "utf8"
  );
  console.info(
    `[retention] wrote identity gaps report for organization ${actor.organizationId} (${report.summary.unresolvedRecords} unresolved records)`
  );
}

main().catch((error) => {
  console.error("[retention] gaps report failed", error);
  process.exitCode = 1;
});
