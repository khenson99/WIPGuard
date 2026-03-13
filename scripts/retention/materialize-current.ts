import { materializeRetentionCurrent } from "@/lib/retention/pipeline";
import { resolveRetentionActor } from "./_shared";

async function main() {
  const actor = await resolveRetentionActor();
  await materializeRetentionCurrent(actor);
  console.info(`[retention] materialized current snapshot for organization ${actor.organizationId}`);
}

main().catch((error) => {
  console.error("[retention] current materialization failed", error);
  process.exitCode = 1;
});
