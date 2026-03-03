import { DealStage } from "@prisma/client";
import {
  validateStageTransition,
  VALID_DEAL_TRANSITIONS,
} from "../stage-transitions";

describe("Deal Stage Transition Validation", () => {
  describe("VALID_DEAL_TRANSITIONS", () => {
    it("should define transitions for all DealStage values", () => {
      const allStages = Object.values(DealStage);
      for (const stage of allStages) {
        expect(VALID_DEAL_TRANSITIONS).toHaveProperty(stage);
        expect(Array.isArray(VALID_DEAL_TRANSITIONS[stage])).toBe(true);
      }
    });

    it("should have CLOSED_WON as terminal with no transitions", () => {
      expect(VALID_DEAL_TRANSITIONS[DealStage.CLOSED_WON]).toEqual([]);
    });

    it("should allow CLOSED_LOST to reopen to LEAD only", () => {
      expect(VALID_DEAL_TRANSITIONS[DealStage.CLOSED_LOST]).toEqual([
        DealStage.LEAD,
      ]);
    });
  });

  describe("validateStageTransition", () => {
    // Valid forward transitions
    describe("valid transitions", () => {
      const validCases: [DealStage, DealStage][] = [
        [DealStage.LEAD, DealStage.QUALIFIED],
        [DealStage.LEAD, DealStage.CLOSED_LOST],
        [DealStage.QUALIFIED, DealStage.PROPOSAL],
        [DealStage.QUALIFIED, DealStage.CLOSED_LOST],
        [DealStage.PROPOSAL, DealStage.NEGOTIATION],
        [DealStage.PROPOSAL, DealStage.QUALIFIED],
        [DealStage.PROPOSAL, DealStage.CLOSED_LOST],
        [DealStage.NEGOTIATION, DealStage.CLOSED_WON],
        [DealStage.NEGOTIATION, DealStage.CLOSED_LOST],
        [DealStage.NEGOTIATION, DealStage.PROPOSAL],
        [DealStage.CLOSED_LOST, DealStage.LEAD],
      ];

      it.each(validCases)(
        "should allow transition from %s to %s",
        (from, to) => {
          const result = validateStageTransition(from, to);
          expect(result.valid).toBe(true);
        }
      );
    });

    // Invalid transitions
    describe("invalid transitions", () => {
      const invalidCases: [DealStage, DealStage][] = [
        [DealStage.LEAD, DealStage.CLOSED_WON],
        [DealStage.LEAD, DealStage.PROPOSAL],
        [DealStage.LEAD, DealStage.NEGOTIATION],
        [DealStage.QUALIFIED, DealStage.CLOSED_WON],
        [DealStage.QUALIFIED, DealStage.NEGOTIATION],
        [DealStage.QUALIFIED, DealStage.LEAD],
        [DealStage.PROPOSAL, DealStage.CLOSED_WON],
        [DealStage.PROPOSAL, DealStage.LEAD],
        [DealStage.NEGOTIATION, DealStage.LEAD],
        [DealStage.NEGOTIATION, DealStage.QUALIFIED],
        [DealStage.CLOSED_WON, DealStage.LEAD],
        [DealStage.CLOSED_WON, DealStage.QUALIFIED],
        [DealStage.CLOSED_WON, DealStage.PROPOSAL],
        [DealStage.CLOSED_WON, DealStage.NEGOTIATION],
        [DealStage.CLOSED_WON, DealStage.CLOSED_LOST],
        [DealStage.CLOSED_LOST, DealStage.QUALIFIED],
        [DealStage.CLOSED_LOST, DealStage.PROPOSAL],
        [DealStage.CLOSED_LOST, DealStage.NEGOTIATION],
        [DealStage.CLOSED_LOST, DealStage.CLOSED_WON],
      ];

      it.each(invalidCases)(
        "should reject transition from %s to %s",
        (from, to) => {
          const result = validateStageTransition(from, to);
          expect(result.valid).toBe(false);
          expect(result.message).toBeDefined();
          expect(result.message).toContain(from);
          expect(result.message).toContain(to);
          expect(result.allowedTransitions).toBeDefined();
        }
      );
    });

    // Same stage (no-op)
    describe("same stage transitions", () => {
      it.each(Object.values(DealStage))(
        "should allow no-op transition for %s",
        (stage) => {
          const result = validateStageTransition(stage, stage);
          expect(result.valid).toBe(true);
        }
      );
    });

    // Admin override
    describe("admin override", () => {
      it("should allow any transition with admin override", () => {
        const result = validateStageTransition(
          DealStage.LEAD,
          DealStage.CLOSED_WON,
          true
        );
        expect(result.valid).toBe(true);
      });

      it("should allow terminal stage transition with admin override", () => {
        const result = validateStageTransition(
          DealStage.CLOSED_WON,
          DealStage.LEAD,
          true
        );
        expect(result.valid).toBe(true);
      });
    });

    // Error message quality
    describe("error messages", () => {
      it("should include allowed transitions in the error for non-terminal stages", () => {
        const result = validateStageTransition(
          DealStage.LEAD,
          DealStage.CLOSED_WON
        );
        expect(result.valid).toBe(false);
        expect(result.message).toContain("QUALIFIED");
        expect(result.message).toContain("CLOSED_LOST");
        expect(result.allowedTransitions).toEqual([
          DealStage.QUALIFIED,
          DealStage.CLOSED_LOST,
        ]);
      });

      it("should indicate terminal stage in error for CLOSED_WON", () => {
        const result = validateStageTransition(
          DealStage.CLOSED_WON,
          DealStage.LEAD
        );
        expect(result.valid).toBe(false);
        expect(result.message).toContain("terminal stage");
        expect(result.allowedTransitions).toEqual([]);
      });
    });
  });
});
