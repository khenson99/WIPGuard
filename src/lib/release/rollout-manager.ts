/**
 * Phased rollout manager.
 *
 * Defines the release lifecycle: pilot -> internal -> beta -> ga
 * Each phase has gate criteria that must be met before promotion.
 * All logic is pure — no side-effects, no DB calls.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type RolloutPhase = "pilot" | "internal" | "beta" | "ga";

export const PHASE_ORDER: readonly RolloutPhase[] = [
  "pilot",
  "internal",
  "beta",
  "ga",
] as const;

export interface GateCriteria {
  /** Human-readable gate name */
  name: string;
  /** Gate description */
  description: string;
  /** Is this gate currently satisfied? */
  met: boolean;
  /** Is this gate required to proceed? */
  required: boolean;
}

export interface PhaseConfig {
  phase: RolloutPhase;
  /** Maximum rollout percentage for this phase */
  maxRolloutPercent: number;
  /** Minimum soak time in hours before promotion is allowed */
  minSoakHours: number;
  /** Gate criteria that must be met for phase entry */
  gates: GateCriteria[];
}

export interface RolloutPlan {
  id: string;
  name: string;
  currentPhase: RolloutPhase;
  phaseConfigs: PhaseConfig[];
  phaseEnteredAt: string; // ISO timestamp
  history: PhaseTransition[];
  rollbackTarget?: RolloutPhase;
}

export interface PhaseTransition {
  from: RolloutPhase;
  to: RolloutPhase;
  timestamp: string;
  actor: string;
  reason: string;
}

export interface TransitionResult {
  success: boolean;
  plan: RolloutPlan;
  blockers: string[];
}

// ──────────────────────────────────────────────
// Default phase configs
// ──────────────────────────────────────────────

export function defaultPhaseConfigs(): PhaseConfig[] {
  return [
    {
      phase: "pilot",
      maxRolloutPercent: 5,
      minSoakHours: 24,
      gates: [
        {
          name: "unit_tests_pass",
          description: "All unit tests pass with >80% coverage",
          met: false,
          required: true,
        },
        {
          name: "security_review",
          description: "Security review completed",
          met: false,
          required: true,
        },
      ],
    },
    {
      phase: "internal",
      maxRolloutPercent: 25,
      minSoakHours: 48,
      gates: [
        {
          name: "pilot_soak_complete",
          description: "Pilot phase soak time has elapsed",
          met: false,
          required: true,
        },
        {
          name: "no_p0_incidents",
          description: "Zero P0 incidents during pilot",
          met: false,
          required: true,
        },
        {
          name: "metrics_baseline",
          description: "Key metrics within acceptable range",
          met: false,
          required: false,
        },
      ],
    },
    {
      phase: "beta",
      maxRolloutPercent: 50,
      minSoakHours: 72,
      gates: [
        {
          name: "internal_soak_complete",
          description: "Internal phase soak time has elapsed",
          met: false,
          required: true,
        },
        {
          name: "error_rate_threshold",
          description: "Error rate below 0.1%",
          met: false,
          required: true,
        },
        {
          name: "stakeholder_signoff",
          description: "Product and engineering leads signed off",
          met: false,
          required: true,
        },
      ],
    },
    {
      phase: "ga",
      maxRolloutPercent: 100,
      minSoakHours: 0,
      gates: [
        {
          name: "beta_soak_complete",
          description: "Beta phase soak time has elapsed",
          met: false,
          required: true,
        },
        {
          name: "documentation_complete",
          description: "Release notes and docs published",
          met: false,
          required: true,
        },
        {
          name: "rollback_tested",
          description: "Rollback procedure tested and verified",
          met: false,
          required: true,
        },
      ],
    },
  ];
}

// ──────────────────────────────────────────────
// Plan creation
// ──────────────────────────────────────────────

export function createRolloutPlan(
  id: string,
  name: string,
  phaseConfigs?: PhaseConfig[],
): RolloutPlan {
  return {
    id,
    name,
    currentPhase: "pilot",
    phaseConfigs: phaseConfigs ?? defaultPhaseConfigs(),
    phaseEnteredAt: new Date().toISOString(),
    history: [],
  };
}

// ──────────────────────────────────────────────
// Phase helpers
// ──────────────────────────────────────────────

export function getPhaseIndex(phase: RolloutPhase): number {
  return PHASE_ORDER.indexOf(phase);
}

export function getNextPhase(phase: RolloutPhase): RolloutPhase | null {
  const idx = getPhaseIndex(phase);
  return idx < PHASE_ORDER.length - 1 ? PHASE_ORDER[idx + 1] : null;
}

export function getPreviousPhase(phase: RolloutPhase): RolloutPhase | null {
  const idx = getPhaseIndex(phase);
  return idx > 0 ? PHASE_ORDER[idx - 1] : null;
}

export function getPhaseConfig(
  plan: RolloutPlan,
  phase: RolloutPhase,
): PhaseConfig | undefined {
  return plan.phaseConfigs.find((c) => c.phase === phase);
}

// ──────────────────────────────────────────────
// Soak time check
// ──────────────────────────────────────────────

export function hasSoakTimeElapsed(
  plan: RolloutPlan,
  now: Date = new Date(),
): boolean {
  const config = getPhaseConfig(plan, plan.currentPhase);
  if (!config) return false;
  const enteredAt = new Date(plan.phaseEnteredAt).getTime();
  const elapsed = (now.getTime() - enteredAt) / (1000 * 60 * 60);
  return elapsed >= config.minSoakHours;
}

// ──────────────────────────────────────────────
// Gate validation
// ──────────────────────────────────────────────

/**
 * Returns list of blocker descriptions for the *target* phase.
 * Empty array means all gates are satisfied.
 */
export function getPromotionBlockers(
  plan: RolloutPlan,
  targetPhase: RolloutPhase,
): string[] {
  const config = getPhaseConfig(plan, targetPhase);
  if (!config) return [`No configuration found for phase "${targetPhase}"`];

  const blockers: string[] = [];
  for (const gate of config.gates) {
    if (gate.required && !gate.met) {
      blockers.push(`Gate "${gate.name}" not met: ${gate.description}`);
    }
  }
  return blockers;
}

// ──────────────────────────────────────────────
// Phase transitions
// ──────────────────────────────────────────────

/**
 * Promote to the next phase if all gates are met and soak time has elapsed.
 */
export function promotePhase(
  plan: RolloutPlan,
  actor: string,
  reason: string,
  now: Date = new Date(),
): TransitionResult {
  const nextPhase = getNextPhase(plan.currentPhase);
  if (!nextPhase) {
    return {
      success: false,
      plan,
      blockers: ["Already at final phase (ga)"],
    };
  }

  // Check soak time for current phase
  if (!hasSoakTimeElapsed(plan, now)) {
    const config = getPhaseConfig(plan, plan.currentPhase)!;
    return {
      success: false,
      plan,
      blockers: [
        `Soak time not met: ${config.minSoakHours}h required for "${plan.currentPhase}" phase`,
      ],
    };
  }

  // Check gates for target phase
  const blockers = getPromotionBlockers(plan, nextPhase);
  if (blockers.length > 0) {
    return { success: false, plan, blockers };
  }

  const transition: PhaseTransition = {
    from: plan.currentPhase,
    to: nextPhase,
    timestamp: now.toISOString(),
    actor,
    reason,
  };

  return {
    success: true,
    plan: {
      ...plan,
      currentPhase: nextPhase,
      phaseEnteredAt: now.toISOString(),
      history: [...plan.history, transition],
    },
    blockers: [],
  };
}

/**
 * Rollback to a previous phase. No gate checks — rollbacks are emergency actions.
 * Must complete within 15 minutes (validated by callers, not enforced here).
 */
export function rollbackPhase(
  plan: RolloutPlan,
  targetPhase: RolloutPhase,
  actor: string,
  reason: string,
): TransitionResult {
  const currentIdx = getPhaseIndex(plan.currentPhase);
  const targetIdx = getPhaseIndex(targetPhase);

  if (targetIdx >= currentIdx) {
    return {
      success: false,
      plan,
      blockers: [
        `Cannot rollback forward: "${targetPhase}" is not before "${plan.currentPhase}"`,
      ],
    };
  }

  const now = new Date().toISOString();
  const transition: PhaseTransition = {
    from: plan.currentPhase,
    to: targetPhase,
    timestamp: now,
    actor,
    reason,
  };

  return {
    success: true,
    plan: {
      ...plan,
      currentPhase: targetPhase,
      phaseEnteredAt: now,
      history: [...plan.history, transition],
      rollbackTarget: targetPhase,
    },
    blockers: [],
  };
}

/**
 * Update gate status on a specific phase config.
 */
export function updateGate(
  plan: RolloutPlan,
  phase: RolloutPhase,
  gateName: string,
  met: boolean,
): RolloutPlan {
  return {
    ...plan,
    phaseConfigs: plan.phaseConfigs.map((pc) =>
      pc.phase === phase
        ? {
            ...pc,
            gates: pc.gates.map((g) =>
              g.name === gateName ? { ...g, met } : g,
            ),
          }
        : pc,
    ),
  };
}
