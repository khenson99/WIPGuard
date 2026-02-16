import { describe, it, expect } from "vitest";

// ─── Types mirroring the policy engine ───────────────────────────────

type EnforcementMode = "WARN" | "BLOCK";
type TaskStatus = "BACKLOG" | "QUEUED" | "ACTIVE" | "DONE" | "NOT_DONE";

interface WipPolicyConfig {
  columnName: string;
  wipLimit: number;
  enforcement: EnforcementMode;
  overrideRoles: string[];
}

interface CommitmentRule {
  maxCommitment: number;
  sprintCapacity: number;
  bufferPercent: number;
}

interface FlowConstraint {
  maxCycleTimeDays: number;
  maxQueueDepth: number;
  blockageAlertThresholdHours: number;
}

interface PolicyResult {
  allowed: boolean;
  warning?: string;
  requiresOverride: boolean;
  enforcement: EnforcementMode | null;
}

// ─── Policy engine (in-memory implementation) ────────────────────────

const EXEMPT_COLUMNS = new Set<TaskStatus>(["BACKLOG", "DONE", "NOT_DONE"]);

function checkWipPolicy(
  targetColumn: TaskStatus,
  currentCount: number,
  userRole: string,
  policies: WipPolicyConfig[],
): PolicyResult {
  if (EXEMPT_COLUMNS.has(targetColumn)) {
    return { allowed: true, requiresOverride: false, enforcement: null };
  }

  const policy = policies.find((p) => p.columnName === targetColumn);
  if (!policy || policy.wipLimit <= 0) {
    return { allowed: true, requiresOverride: false, enforcement: null };
  }

  if (currentCount < policy.wipLimit) {
    return { allowed: true, requiresOverride: false, enforcement: policy.enforcement };
  }

  if (policy.enforcement === "WARN") {
    return {
      allowed: true,
      warning: `WIP limit (${policy.wipLimit}) reached for ${targetColumn}`,
      requiresOverride: false,
      enforcement: "WARN",
    };
  }

  // BLOCK mode
  const canOverride = policy.overrideRoles.includes(userRole);
  if (canOverride) {
    return {
      allowed: true,
      warning: `Override allowed for role "${userRole}"`,
      requiresOverride: true,
      enforcement: "BLOCK",
    };
  }

  return {
    allowed: false,
    warning: `WIP limit (${policy.wipLimit}) exceeded. Role "${userRole}" cannot override.`,
    requiresOverride: false,
    enforcement: "BLOCK",
  };
}

function checkCommitmentRule(
  currentCommitted: number,
  rule: CommitmentRule,
): { allowed: boolean; remaining: number; warning?: string } {
  const effectiveCapacity = Math.floor(
    rule.sprintCapacity * (1 - rule.bufferPercent / 100),
  );
  const remaining = Math.max(0, effectiveCapacity - currentCommitted);
  const allowed = currentCommitted < effectiveCapacity;

  return {
    allowed,
    remaining,
    warning: allowed
      ? undefined
      : `Sprint commitment capacity reached (${currentCommitted}/${effectiveCapacity})`,
  };
}

function checkFlowConstraint(
  queueDepth: number,
  oldestItemAgeDays: number,
  constraint: FlowConstraint,
): { healthy: boolean; violations: string[] } {
  const violations: string[] = [];

  if (queueDepth > constraint.maxQueueDepth) {
    violations.push(
      `Queue depth (${queueDepth}) exceeds max (${constraint.maxQueueDepth})`,
    );
  }

  if (oldestItemAgeDays > constraint.maxCycleTimeDays) {
    violations.push(
      `Oldest item age (${oldestItemAgeDays}d) exceeds cycle time limit (${constraint.maxCycleTimeDays}d)`,
    );
  }

  return { healthy: violations.length === 0, violations };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("Policy Enforcement Integration", () => {
  describe("WIP limit policies", () => {
    const defaultPolicies: WipPolicyConfig[] = [
      { columnName: "QUEUED", wipLimit: 5, enforcement: "WARN", overrideRoles: ["admin"] },
      { columnName: "ACTIVE", wipLimit: 3, enforcement: "BLOCK", overrideRoles: ["admin", "lead"] },
    ];

    it("allows moves under WIP limit", () => {
      const result = checkWipPolicy("ACTIVE", 1, "member", defaultPolicies);
      expect(result.allowed).toBe(true);
      expect(result.warning).toBeUndefined();
    });

    it("warns when WARN column reaches limit", () => {
      const result = checkWipPolicy("QUEUED", 5, "member", defaultPolicies);
      expect(result.allowed).toBe(true);
      expect(result.warning).toContain("WIP limit");
      expect(result.enforcement).toBe("WARN");
    });

    it("blocks non-override roles at BLOCK limit", () => {
      const result = checkWipPolicy("ACTIVE", 3, "member", defaultPolicies);
      expect(result.allowed).toBe(false);
      expect(result.enforcement).toBe("BLOCK");
    });

    it("allows override for admin in BLOCK mode", () => {
      const result = checkWipPolicy("ACTIVE", 3, "admin", defaultPolicies);
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(true);
    });

    it("allows override for lead in BLOCK mode", () => {
      const result = checkWipPolicy("ACTIVE", 3, "lead", defaultPolicies);
      expect(result.allowed).toBe(true);
      expect(result.requiresOverride).toBe(true);
    });

    it("never enforces on exempt columns", () => {
      for (const col of ["BACKLOG", "DONE", "NOT_DONE"] as TaskStatus[]) {
        const result = checkWipPolicy(col, 999, "member", defaultPolicies);
        expect(result.allowed).toBe(true);
        expect(result.enforcement).toBeNull();
      }
    });

    it("allows freely when no policies configured", () => {
      const result = checkWipPolicy("ACTIVE", 100, "member", []);
      expect(result.allowed).toBe(true);
      expect(result.enforcement).toBeNull();
    });

    it("allows freely when wipLimit is 0 (unconfigured)", () => {
      const result = checkWipPolicy("ACTIVE", 50, "member", [
        { columnName: "ACTIVE", wipLimit: 0, enforcement: "BLOCK", overrideRoles: [] },
      ]);
      expect(result.allowed).toBe(true);
    });
  });

  describe("commitment rules", () => {
    const sprintRule: CommitmentRule = {
      maxCommitment: 20,
      sprintCapacity: 20,
      bufferPercent: 20,
    };

    it("allows commitment below effective capacity", () => {
      // Effective capacity = 20 * (1 - 0.2) = 16
      const result = checkCommitmentRule(10, sprintRule);
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(6);
    });

    it("blocks commitment at effective capacity", () => {
      const result = checkCommitmentRule(16, sprintRule);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.warning).toContain("capacity reached");
    });

    it("blocks commitment beyond effective capacity", () => {
      const result = checkCommitmentRule(18, sprintRule);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });

    it("handles zero buffer as full capacity", () => {
      const result = checkCommitmentRule(19, {
        maxCommitment: 20,
        sprintCapacity: 20,
        bufferPercent: 0,
      });
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(1);
    });

    it("handles 100% buffer as zero capacity", () => {
      const result = checkCommitmentRule(0, {
        maxCommitment: 20,
        sprintCapacity: 20,
        bufferPercent: 100,
      });
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe("flow constraints", () => {
    const constraint: FlowConstraint = {
      maxCycleTimeDays: 14,
      maxQueueDepth: 10,
      blockageAlertThresholdHours: 48,
    };

    it("reports healthy when within all constraints", () => {
      const result = checkFlowConstraint(5, 7, constraint);
      expect(result.healthy).toBe(true);
      expect(result.violations).toHaveLength(0);
    });

    it("flags excessive queue depth", () => {
      const result = checkFlowConstraint(15, 3, constraint);
      expect(result.healthy).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain("Queue depth");
    });

    it("flags cycle time violation", () => {
      const result = checkFlowConstraint(5, 20, constraint);
      expect(result.healthy).toBe(false);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0]).toContain("cycle time");
    });

    it("reports multiple violations simultaneously", () => {
      const result = checkFlowConstraint(15, 20, constraint);
      expect(result.healthy).toBe(false);
      expect(result.violations).toHaveLength(2);
    });

    it("is healthy at exact boundary values", () => {
      const result = checkFlowConstraint(10, 14, constraint);
      expect(result.healthy).toBe(true);
    });
  });

  describe("multi-policy interaction", () => {
    it("enforces the strictest applicable policy per column", () => {
      const policies: WipPolicyConfig[] = [
        { columnName: "ACTIVE", wipLimit: 3, enforcement: "BLOCK", overrideRoles: ["admin"] },
      ];

      // Under limit: allowed
      expect(checkWipPolicy("ACTIVE", 2, "member", policies).allowed).toBe(true);
      // At limit: blocked for member
      expect(checkWipPolicy("ACTIVE", 3, "member", policies).allowed).toBe(false);
      // At limit: override for admin
      expect(checkWipPolicy("ACTIVE", 3, "admin", policies).allowed).toBe(true);
    });

    it("combines commitment and WIP checks for sprint planning scenario", () => {
      const policies: WipPolicyConfig[] = [
        { columnName: "ACTIVE", wipLimit: 5, enforcement: "BLOCK", overrideRoles: [] },
      ];
      const commitRule: CommitmentRule = {
        maxCommitment: 10,
        sprintCapacity: 10,
        bufferPercent: 20,
      };

      // WIP is fine (2 < 5), but commitment at capacity (8 >= 8)
      const wipResult = checkWipPolicy("ACTIVE", 2, "member", policies);
      const commitResult = checkCommitmentRule(8, commitRule);

      expect(wipResult.allowed).toBe(true);
      expect(commitResult.allowed).toBe(false);
      // Overall: should be blocked by commitment even though WIP allows
    });
  });
});
