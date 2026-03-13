import { buildRetentionDataset } from "@/lib/retention/pipeline";
import { resolveRetentionActor } from "./_shared";

async function main() {
  const actor = await resolveRetentionActor();
  await buildRetentionDataset(actor);
  console.info(`[retention] built tenant-month dataset for organization ${actor.organizationId}`);
}

main().catch((error) => {
  console.error("[retention] dataset build failed", error);
  process.exitCode = 1;
});
