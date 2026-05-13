export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createFlagStore,
  createFlag,
  evaluateFlag,
  listFlags,
  FLAG_NAMES,
  type FeatureFlag,
  type FlagEvaluationContext,
} from "@/lib/release/feature-flags";
import {
  createRolloutPlan,
  type RolloutPlan,
} from "@/lib/release/rollout-manager";
import {
  createReleaseChecklist,
  evaluateChecklist,
} from "@/lib/release/readiness-checklist";

/**
 * GET /api/release/status
 *
 * Returns the current release status including:
 * - Feature flags and their states
 * - Active rollout plan
 * - Release readiness checklist evaluation
 *
 * This is a read-only diagnostic endpoint for release dashboards.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Build current flag state (in production this would come from DB)
    let store = createFlagStore();
    const now = new Date().toISOString();
    const flagDefs: FeatureFlag[] = Object.values(FLAG_NAMES).map((name) => ({
      name,
      description: `Feature flag for ${name}`,
      enabled: true,
      rolloutPercentage: 0,
      allowList: [],
      denyList: [],
      createdAt: now,
      updatedAt: now,
    }));

    for (const flag of flagDefs) {
      store = createFlag(store, flag, "system");
    }

    const context: FlagEvaluationContext = {
      userId: session.user.id ?? "unknown",
      environment: (process.env.NODE_ENV as "development" | "staging" | "production") ?? "development",
    };

    const flagStatus = listFlags(store).map((flag) => ({
      name: flag.name,
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage,
      evaluatedForUser: evaluateFlag(store, flag.name, context),
    }));

    // Active rollout plan (in production this comes from DB)
    const plan: RolloutPlan = createRolloutPlan("current", "Imladris Release");

    // Release checklist evaluation
    const checklist = createReleaseChecklist("current", "0.1.0");
    const evaluation = evaluateChecklist(checklist);

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      flags: flagStatus,
      rollout: {
        id: plan.id,
        name: plan.name,
        currentPhase: plan.currentPhase,
        phaseEnteredAt: plan.phaseEnteredAt,
      },
      readiness: {
        ready: evaluation.ready,
        hardGates: `${evaluation.hardGatesPassed}/${evaluation.hardGatesTotal}`,
        softGates: `${evaluation.softGatesPassed}/${evaluation.softGatesTotal}`,
        blockerCount: evaluation.blockers.length,
        warningCount: evaluation.warnings.length,
      },
    });
  } catch (error) {
    console.error("[release/status] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
