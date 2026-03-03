import { DealStage } from "@/generated/prisma/client";

/**
 * Valid deal stage transitions.
 * Each key maps to an array of stages that can be transitioned TO from that stage.
 *
 * Rules:
 * - LEAD can go to QUALIFIED or CLOSED_LOST
 * - QUALIFIED can go to PROPOSAL or CLOSED_LOST
 * - PROPOSAL can go to NEGOTIATION, back to QUALIFIED, or CLOSED_LOST
 * - NEGOTIATION can go to CLOSED_WON, CLOSED_LOST, or back to PROPOSAL
 * - CLOSED_WON is terminal (no transitions allowed)
 * - CLOSED_LOST can be reopened to LEAD
 */
export const VALID_DEAL_TRANSITIONS: Record<DealStage, DealStage[]> = {
  [DealStage.LEAD]: [DealStage.QUALIFIED, DealStage.CLOSED_LOST],
  [DealStage.QUALIFIED]: [DealStage.PROPOSAL, DealStage.CLOSED_LOST],
  [DealStage.PROPOSAL]: [
    DealStage.NEGOTIATION,
    DealStage.QUALIFIED,
    DealStage.CLOSED_LOST,
  ],
  [DealStage.NEGOTIATION]: [
    DealStage.CLOSED_WON,
    DealStage.CLOSED_LOST,
    DealStage.PROPOSAL,
  ],
  [DealStage.CLOSED_WON]: [],
  [DealStage.CLOSED_LOST]: [DealStage.LEAD],
};

export interface StageTransitionResult {
  valid: boolean;
  message?: string;
  allowedTransitions?: DealStage[];
}

/**
 * Validates whether a deal stage transition is allowed.
 *
 * @param currentStage - The current stage of the deal
 * @param targetStage - The desired target stage
 * @param adminOverride - If true, allows any transition (for admin use with audit logging)
 * @returns StageTransitionResult indicating validity and allowed transitions
 */
export function validateStageTransition(
  currentStage: DealStage,
  targetStage: DealStage,
  adminOverride: boolean = false
): StageTransitionResult {
  // Same stage is always a no-op (valid but no change)
  if (currentStage === targetStage) {
    return { valid: true };
  }

  // Admin override bypasses validation
  if (adminOverride) {
    return { valid: true };
  }

  const allowed = VALID_DEAL_TRANSITIONS[currentStage];

  if (!allowed) {
    return {
      valid: false,
      message: `Unknown current stage: ${currentStage}`,
      allowedTransitions: [],
    };
  }

  if (allowed.includes(targetStage)) {
    return { valid: true };
  }

  return {
    valid: false,
    message: `Invalid stage transition from ${currentStage} to ${targetStage}. Allowed transitions from ${currentStage}: ${allowed.length > 0 ? allowed.join(", ") : "none (terminal stage)"}`,
    allowedTransitions: allowed,
  };
}
