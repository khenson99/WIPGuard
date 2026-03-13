import { syncRetentionSources } from "@/lib/retention/pipeline";
import { resolveRetentionActor } from "./_shared";

async function main() {
  const actor = await resolveRetentionActor();
  await syncRetentionSources(actor);
  console.info(`[retention] synced sources for organization ${actor.organizationId}`);
}

main().catch((error) => {
  console.error("[retention] source sync failed", error);
  process.exitCode = 1;
});
