/**
 * Release readiness checklist with hard gates and soft gates.
 *
 * Hard gates block release — they cannot be overridden.
 * Soft gates are recommended but can be overridden with justification.
 * All logic is pure — no side-effects, no DB calls.
 */

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

export type GateType = "hard" | "soft";

export interface ChecklistItem {
  id: string;
  name: string;
  description: string;
  gateType: GateType;
  category: string;
  /** Is this check satisfied? */
  passed: boolean;
  /** If soft gate was overridden, who approved and why */
  override?: {
    approvedBy: string;
    justification: string;
    timestamp: string;
  };
}

export interface ReleaseChecklist {
  releaseId: string;
  version: string;
  createdAt: string;
  items: ChecklistItem[];
}

export interface ChecklistEvaluation {
  ready: boolean;
  hardGatesPassed: number;
  hardGatesTotal: number;
  softGatesPassed: number;
  softGatesTotal: number;
  softGatesOverridden: number;
  blockers: ChecklistItem[];
  warnings: ChecklistItem[];
}

// ──────────────────────────────────────────────
// Default checklist template
// ──────────────────────────────────────────────

export function defaultChecklistItems(): Omit<
  ChecklistItem,
  "passed" | "override"
>[] {
  return [
    // Hard gates — required, no override
    {
      id: "tests-pass",
      name: "All tests pass",
      description: "CI pipeline shows green across all test suites",
      gateType: "hard",
      category: "quality",
    },
    {
      id: "no-critical-bugs",
      name: "No critical bugs",
      description: "Zero P0/P1 bugs in the release scope",
      gateType: "hard",
      category: "quality",
    },
    {
      id: "security-scan",
      name: "Security scan clean",
      description: "No high/critical vulnerabilities in dependency scan",
      gateType: "hard",
      category: "security",
    },
    {
      id: "rollback-tested",
      name: "Rollback tested",
      description:
        "Rollback procedure tested in staging, completes in <15 minutes",
      gateType: "hard",
      category: "operations",
    },
    {
      id: "data-migration-tested",
      name: "Data migration tested",
      description:
        "Database migrations tested with production-like data volume",
      gateType: "hard",
      category: "operations",
    },
    // Soft gates — recommended, overridable
    {
      id: "perf-benchmarks",
      name: "Performance benchmarks met",
      description: "P95 latency within SLO for all critical paths",
      gateType: "soft",
      category: "performance",
    },
    {
      id: "docs-updated",
      name: "Documentation updated",
      description: "API docs, runbooks, and changelog are current",
      gateType: "soft",
      category: "documentation",
    },
    {
      id: "stakeholder-signoff",
      name: "Stakeholder signoff",
      description: "Product manager and tech lead have approved",
      gateType: "soft",
      category: "process",
    },
    {
      id: "feature-flags-configured",
      name: "Feature flags configured",
      description: "All new features have flags with kill switches",
      gateType: "soft",
      category: "operations",
    },
    {
      id: "monitoring-alerts",
      name: "Monitoring alerts configured",
      description: "Alerts for error rate, latency, and key metrics",
      gateType: "soft",
      category: "operations",
    },
  ];
}

// ──────────────────────────────────────────────
// Checklist CRUD
// ──────────────────────────────────────────────

export function createReleaseChecklist(
  releaseId: string,
  version: string,
  items?: Omit<ChecklistItem, "passed" | "override">[],
): ReleaseChecklist {
  const template = items ?? defaultChecklistItems();
  return {
    releaseId,
    version,
    createdAt: new Date().toISOString(),
    items: template.map((t) => ({ ...t, passed: false })),
  };
}

export function setItemPassed(
  checklist: ReleaseChecklist,
  itemId: string,
  passed: boolean,
): ReleaseChecklist {
  return {
    ...checklist,
    items: checklist.items.map((item) =>
      item.id === itemId ? { ...item, passed } : item,
    ),
  };
}

/**
 * Override a soft gate. Hard gates cannot be overridden.
 */
export function overrideSoftGate(
  checklist: ReleaseChecklist,
  itemId: string,
  approvedBy: string,
  justification: string,
): ReleaseChecklist {
  const item = checklist.items.find((i) => i.id === itemId);
  if (!item) throw new Error(`Checklist item "${itemId}" not found`);
  if (item.gateType === "hard") {
    throw new Error(`Cannot override hard gate "${itemId}"`);
  }
  if (justification.trim().length === 0) {
    throw new Error("Justification is required to override a soft gate");
  }
  return {
    ...checklist,
    items: checklist.items.map((i) =>
      i.id === itemId
        ? {
            ...i,
            passed: true,
            override: {
              approvedBy,
              justification,
              timestamp: new Date().toISOString(),
            },
          }
        : i,
    ),
  };
}

// ──────────────────────────────────────────────
// Evaluation
// ──────────────────────────────────────────────

export function evaluateChecklist(
  checklist: ReleaseChecklist,
): ChecklistEvaluation {
  const hard = checklist.items.filter((i) => i.gateType === "hard");
  const soft = checklist.items.filter((i) => i.gateType === "soft");

  const hardPassed = hard.filter((i) => i.passed).length;
  const softPassed = soft.filter((i) => i.passed).length;
  const softOverridden = soft.filter((i) => i.override).length;

  const blockers = hard.filter((i) => !i.passed);
  const warnings = soft.filter((i) => !i.passed);

  const allHardMet = hardPassed === hard.length;

  return {
    ready: allHardMet,
    hardGatesPassed: hardPassed,
    hardGatesTotal: hard.length,
    softGatesPassed: softPassed,
    softGatesTotal: soft.length,
    softGatesOverridden: softOverridden,
    blockers,
    warnings,
  };
}

export function getBlockers(checklist: ReleaseChecklist): ChecklistItem[] {
  return checklist.items.filter(
    (i) => i.gateType === "hard" && !i.passed,
  );
}

export function getWarnings(checklist: ReleaseChecklist): ChecklistItem[] {
  return checklist.items.filter(
    (i) => i.gateType === "soft" && !i.passed,
  );
}

export function isReleaseReady(checklist: ReleaseChecklist): boolean {
  return evaluateChecklist(checklist).ready;
}
