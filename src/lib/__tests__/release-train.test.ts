import { describe, expect, it } from "vitest";

// ── Feature Flags ────────────────────────────
import {
  FLAG_NAMES,
  createFlagStore,
  createFlag,
  updateFlag,
  deleteFlag,
  getFlag,
  listFlags,
  evaluateFlag,
  evaluateFlagWithAudit,
  deterministicHash,
  type FeatureFlag,
  type FlagEvaluationContext,
} from "@/lib/release/feature-flags";

// ── Rollout Manager ──────────────────────────
import {
  PHASE_ORDER,
  createRolloutPlan,
  getPhaseIndex,
  getNextPhase,
  getPreviousPhase,
  getPhaseConfig,
  hasSoakTimeElapsed,
  promotePhase,
  rollbackPhase,
  updateGate,
  defaultPhaseConfigs,
} from "@/lib/release/rollout-manager";

// ── Readiness Checklist ──────────────────────
import {
  createReleaseChecklist,
  setItemPassed,
  overrideSoftGate,
  evaluateChecklist,
  getBlockers,
  getWarnings,
  isReleaseReady,
  defaultChecklistItems,
} from "@/lib/release/readiness-checklist";

// ── Changelog ────────────────────────────────
import {
  generateChangelog,
  formatAsMarkdown,
  formatForSlack,
  hasBreakingChanges,
  filterByCategory,
  entrySummary,
  type ChangeEntry,
} from "@/lib/release/change-log";

// ────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────

function makeFlag(overrides: Partial<FeatureFlag> = {}): FeatureFlag {
  const now = new Date().toISOString();
  return {
    name: "test_flag",
    description: "A test flag",
    enabled: true,
    rolloutPercentage: 100,
    allowList: [],
    denyList: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeContext(overrides: Partial<FlagEvaluationContext> = {}): FlagEvaluationContext {
  return {
    userId: "user-1",
    teamId: "team-1",
    environment: "production",
    ...overrides,
  };
}

function makeEntries(): ChangeEntry[] {
  return [
    {
      id: "1",
      category: "added",
      description: "New dashboard widget",
      issueRef: "#101",
      author: "alice",
      breakingChange: false,
    },
    {
      id: "2",
      category: "fixed",
      description: "Fixed login timeout",
      issueRef: "#102",
      breakingChange: false,
    },
    {
      id: "3",
      category: "changed",
      description: "API response format updated",
      breakingChange: true,
    },
    {
      id: "4",
      category: "security",
      description: "Patched XSS vulnerability",
      breakingChange: false,
    },
    {
      id: "5",
      category: "added",
      description: "Feature flag support",
      breakingChange: false,
    },
  ];
}

// ════════════════════════════════════════════════════════════════
// FEATURE FLAGS
// ════════════════════════════════════════════════════════════════

describe("feature-flags", () => {
  describe("FLAG_NAMES", () => {
    it("exposes the four canonical flag names", () => {
      expect(FLAG_NAMES.hubspot_sync).toBe("hubspot_sync");
      expect(FLAG_NAMES.slack_integration).toBe("slack_integration");
      expect(FLAG_NAMES.coda_migration).toBe("coda_migration");
      expect(FLAG_NAMES.realtime_events).toBe("realtime_events");
    });
  });

  describe("deterministicHash", () => {
    it("returns same value for same input", () => {
      const a = deterministicHash("flag:user-1");
      const b = deterministicHash("flag:user-1");
      expect(a).toBe(b);
    });

    it("returns values in 0-99 range", () => {
      for (let i = 0; i < 100; i++) {
        const h = deterministicHash(`test:${i}`);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThan(100);
      }
    });

    it("produces different hashes for different inputs", () => {
      const a = deterministicHash("flag:user-1");
      const b = deterministicHash("flag:user-2");
      // Statistically near-certain for these specific inputs
      expect(a).not.toBe(b);
    });
  });

  describe("CRUD operations", () => {
    it("creates a flag and records audit entry", () => {
      let store = createFlagStore();
      store = createFlag(store, makeFlag({ name: "test" }), "admin");
      expect(store.flags.size).toBe(1);
      expect(store.auditLog).toHaveLength(1);
      expect(store.auditLog[0].action).toBe("created");
    });

    it("updates a flag and preserves createdAt", () => {
      let store = createFlagStore();
      store = createFlag(store, makeFlag({ name: "test" }), "admin");
      const original = getFlag(store, "test")!;
      store = updateFlag(store, "test", { rolloutPercentage: 50 }, "admin");
      const updated = getFlag(store, "test")!;
      expect(updated.rolloutPercentage).toBe(50);
      expect(updated.createdAt).toBe(original.createdAt);
    });

    it("deletes a flag", () => {
      let store = createFlagStore();
      store = createFlag(store, makeFlag({ name: "test" }), "admin");
      store = deleteFlag(store, "test", "admin");
      expect(store.flags.size).toBe(0);
      expect(store.auditLog).toHaveLength(2);
      expect(store.auditLog[1].action).toBe("deleted");
    });

    it("throws when updating non-existent flag", () => {
      const store = createFlagStore();
      expect(() => updateFlag(store, "missing", {}, "admin")).toThrow(
        'Flag "missing" not found',
      );
    });

    it("throws when deleting non-existent flag", () => {
      const store = createFlagStore();
      expect(() => deleteFlag(store, "missing", "admin")).toThrow(
        'Flag "missing" not found',
      );
    });

    it("lists all flags", () => {
      let store = createFlagStore();
      store = createFlag(store, makeFlag({ name: "a" }), "admin");
      store = createFlag(store, makeFlag({ name: "b" }), "admin");
      expect(listFlags(store)).toHaveLength(2);
    });
  });

  describe("evaluateFlag", () => {
    it("returns false for disabled flag", () => {
      let store = createFlagStore();
      store = createFlag(store, makeFlag({ name: "f", enabled: false }), "admin");
      expect(evaluateFlag(store, "f", makeContext())).toBe(false);
    });

    it("returns false for non-existent flag", () => {
      const store = createFlagStore();
      expect(evaluateFlag(store, "missing", makeContext())).toBe(false);
    });

    it("deny list overrides allow list", () => {
      let store = createFlagStore();
      store = createFlag(
        store,
        makeFlag({
          name: "f",
          allowList: ["user-1"],
          denyList: ["user-1"],
        }),
        "admin",
      );
      expect(evaluateFlag(store, "f", makeContext({ userId: "user-1" }))).toBe(false);
    });

    it("allow list grants access when user is listed", () => {
      let store = createFlagStore();
      store = createFlag(
        store,
        makeFlag({ name: "f", allowList: ["user-1"], rolloutPercentage: 0 }),
        "admin",
      );
      expect(evaluateFlag(store, "f", makeContext({ userId: "user-1" }))).toBe(true);
    });

    it("allow list blocks access when user is NOT listed", () => {
      let store = createFlagStore();
      store = createFlag(
        store,
        makeFlag({ name: "f", allowList: ["user-1"], rolloutPercentage: 100 }),
        "admin",
      );
      expect(evaluateFlag(store, "f", makeContext({ userId: "user-2" }))).toBe(false);
    });

    it("100% rollout enables for all users", () => {
      let store = createFlagStore();
      store = createFlag(
        store,
        makeFlag({ name: "f", rolloutPercentage: 100 }),
        "admin",
      );
      // Check several users
      for (let i = 0; i < 20; i++) {
        expect(evaluateFlag(store, "f", makeContext({ userId: `user-${i}` }))).toBe(true);
      }
    });

    it("0% rollout disables for all users", () => {
      let store = createFlagStore();
      store = createFlag(
        store,
        makeFlag({ name: "f", rolloutPercentage: 0 }),
        "admin",
      );
      for (let i = 0; i < 20; i++) {
        expect(evaluateFlag(store, "f", makeContext({ userId: `user-${i}` }))).toBe(false);
      }
    });

    it("is deterministic — same input always same result", () => {
      let store = createFlagStore();
      store = createFlag(
        store,
        makeFlag({ name: "f", rolloutPercentage: 50 }),
        "admin",
      );
      const ctx = makeContext({ userId: "user-42" });
      const result1 = evaluateFlag(store, "f", ctx);
      const result2 = evaluateFlag(store, "f", ctx);
      expect(result1).toBe(result2);
    });
  });

  describe("evaluateFlagWithAudit", () => {
    it("records evaluation in audit log", () => {
      let store = createFlagStore();
      store = createFlag(store, makeFlag({ name: "f" }), "admin");
      const { result, store: updatedStore } = evaluateFlagWithAudit(
        store,
        "f",
        makeContext(),
      );
      expect(typeof result).toBe("boolean");
      const evalEntries = updatedStore.auditLog.filter(
        (e) => e.action === "evaluated",
      );
      expect(evalEntries).toHaveLength(1);
      expect(evalEntries[0].evaluationResult).toBe(result);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// ROLLOUT MANAGER
// ════════════════════════════════════════════════════════════════

describe("rollout-manager", () => {
  describe("phase helpers", () => {
    it("PHASE_ORDER is pilot -> internal -> beta -> ga", () => {
      expect(PHASE_ORDER).toEqual(["pilot", "internal", "beta", "ga"]);
    });

    it("getPhaseIndex returns correct indices", () => {
      expect(getPhaseIndex("pilot")).toBe(0);
      expect(getPhaseIndex("ga")).toBe(3);
    });

    it("getNextPhase returns next phase or null for ga", () => {
      expect(getNextPhase("pilot")).toBe("internal");
      expect(getNextPhase("ga")).toBeNull();
    });

    it("getPreviousPhase returns previous phase or null for pilot", () => {
      expect(getPreviousPhase("internal")).toBe("pilot");
      expect(getPreviousPhase("pilot")).toBeNull();
    });
  });

  describe("createRolloutPlan", () => {
    it("starts at pilot phase", () => {
      const plan = createRolloutPlan("r-1", "Release 1");
      expect(plan.currentPhase).toBe("pilot");
      expect(plan.history).toHaveLength(0);
    });

    it("uses default phase configs when none provided", () => {
      const plan = createRolloutPlan("r-1", "Release 1");
      expect(plan.phaseConfigs).toHaveLength(4);
    });
  });

  describe("soak time", () => {
    it("returns false when soak time has not elapsed", () => {
      const plan = createRolloutPlan("r-1", "Release 1");
      // Pilot requires 24h, checking immediately
      expect(hasSoakTimeElapsed(plan, new Date())).toBe(false);
    });

    it("returns true when soak time has elapsed", () => {
      const plan = createRolloutPlan("r-1", "Release 1");
      const future = new Date(
        new Date(plan.phaseEnteredAt).getTime() + 25 * 60 * 60 * 1000,
      );
      expect(hasSoakTimeElapsed(plan, future)).toBe(true);
    });
  });

  describe("promotePhase", () => {
    it("blocks promotion when soak time not met", () => {
      const plan = createRolloutPlan("r-1", "Release 1");
      const result = promotePhase(plan, "admin", "test", new Date());
      expect(result.success).toBe(false);
      expect(result.blockers[0]).toContain("Soak time");
    });

    it("blocks promotion when gates not met", () => {
      const plan = createRolloutPlan("r-1", "Release 1");
      const future = new Date(
        new Date(plan.phaseEnteredAt).getTime() + 25 * 60 * 60 * 1000,
      );
      const result = promotePhase(plan, "admin", "test", future);
      expect(result.success).toBe(false);
      expect(result.blockers.length).toBeGreaterThan(0);
    });

    it("succeeds when soak time and all gates are met", () => {
      let plan = createRolloutPlan("r-1", "Release 1");
      // Mark all internal phase gates as met
      const internalConfig = getPhaseConfig(plan, "internal")!;
      for (const gate of internalConfig.gates) {
        plan = updateGate(plan, "internal", gate.name, true);
      }
      // Advance past soak time
      const future = new Date(
        new Date(plan.phaseEnteredAt).getTime() + 25 * 60 * 60 * 1000,
      );
      const result = promotePhase(plan, "admin", "Moving to internal", future);
      expect(result.success).toBe(true);
      expect(result.plan.currentPhase).toBe("internal");
      expect(result.plan.history).toHaveLength(1);
    });

    it("blocks promotion from ga (final phase)", () => {
      let plan = createRolloutPlan("r-1", "Release 1");
      // Force to ga phase for testing
      plan = { ...plan, currentPhase: "ga" };
      const result = promotePhase(plan, "admin", "test");
      expect(result.success).toBe(false);
      expect(result.blockers[0]).toContain("final phase");
    });
  });

  describe("rollbackPhase", () => {
    it("can rollback to a previous phase", () => {
      let plan = createRolloutPlan("r-1", "Release 1");
      plan = { ...plan, currentPhase: "beta" };
      const result = rollbackPhase(plan, "pilot", "admin", "Critical bug");
      expect(result.success).toBe(true);
      expect(result.plan.currentPhase).toBe("pilot");
      expect(result.plan.rollbackTarget).toBe("pilot");
    });

    it("blocks rollback to same or later phase", () => {
      let plan = createRolloutPlan("r-1", "Release 1");
      plan = { ...plan, currentPhase: "internal" };
      const result = rollbackPhase(plan, "beta", "admin", "Nope");
      expect(result.success).toBe(false);
      expect(result.blockers[0]).toContain("not before");
    });
  });

  describe("updateGate", () => {
    it("sets gate status on specific phase", () => {
      let plan = createRolloutPlan("r-1", "Release 1");
      plan = updateGate(plan, "pilot", "unit_tests_pass", true);
      const config = getPhaseConfig(plan, "pilot")!;
      const gate = config.gates.find((g) => g.name === "unit_tests_pass");
      expect(gate?.met).toBe(true);
    });
  });

  describe("defaultPhaseConfigs", () => {
    it("produces 4 phase configs", () => {
      expect(defaultPhaseConfigs()).toHaveLength(4);
    });

    it("pilot maxRolloutPercent is 5", () => {
      const configs = defaultPhaseConfigs();
      expect(configs[0].maxRolloutPercent).toBe(5);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// READINESS CHECKLIST
// ════════════════════════════════════════════════════════════════

describe("readiness-checklist", () => {
  describe("createReleaseChecklist", () => {
    it("creates checklist with all items unpassed", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      expect(cl.items.every((i) => i.passed === false)).toBe(true);
    });

    it("uses default items when none provided", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      expect(cl.items.length).toBe(defaultChecklistItems().length);
    });
  });

  describe("evaluateChecklist", () => {
    it("returns not-ready when hard gates are unsatisfied", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      const evaluation = evaluateChecklist(cl);
      expect(evaluation.ready).toBe(false);
      expect(evaluation.blockers.length).toBeGreaterThan(0);
    });

    it("returns ready when all hard gates pass (soft gates ignored)", () => {
      let cl = createReleaseChecklist("rel-1", "1.0.0");
      const hardItems = cl.items.filter((i) => i.gateType === "hard");
      for (const item of hardItems) {
        cl = setItemPassed(cl, item.id, true);
      }
      const evaluation = evaluateChecklist(cl);
      expect(evaluation.ready).toBe(true);
      expect(evaluation.warnings.length).toBeGreaterThan(0); // soft gates still warn
    });
  });

  describe("overrideSoftGate", () => {
    it("overrides a soft gate with justification", () => {
      let cl = createReleaseChecklist("rel-1", "1.0.0");
      cl = overrideSoftGate(cl, "perf-benchmarks", "admin", "Acceptable for pilot");
      const item = cl.items.find((i) => i.id === "perf-benchmarks")!;
      expect(item.passed).toBe(true);
      expect(item.override?.approvedBy).toBe("admin");
    });

    it("throws when trying to override a hard gate", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      expect(() =>
        overrideSoftGate(cl, "tests-pass", "admin", "Yolo"),
      ).toThrow("Cannot override hard gate");
    });

    it("throws when justification is empty", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      expect(() =>
        overrideSoftGate(cl, "perf-benchmarks", "admin", "   "),
      ).toThrow("Justification is required");
    });

    it("throws for non-existent item", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      expect(() =>
        overrideSoftGate(cl, "nonexistent", "admin", "reason"),
      ).toThrow('Checklist item "nonexistent" not found');
    });
  });

  describe("getBlockers / getWarnings", () => {
    it("getBlockers returns only unsatisfied hard gates", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      const blockers = getBlockers(cl);
      expect(blockers.every((b) => b.gateType === "hard")).toBe(true);
    });

    it("getWarnings returns only unsatisfied soft gates", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      const warnings = getWarnings(cl);
      expect(warnings.every((w) => w.gateType === "soft")).toBe(true);
    });
  });

  describe("isReleaseReady", () => {
    it("returns false when hard gates are not met", () => {
      const cl = createReleaseChecklist("rel-1", "1.0.0");
      expect(isReleaseReady(cl)).toBe(false);
    });

    it("returns true when all hard gates pass", () => {
      let cl = createReleaseChecklist("rel-1", "1.0.0");
      for (const item of cl.items.filter((i) => i.gateType === "hard")) {
        cl = setItemPassed(cl, item.id, true);
      }
      expect(isReleaseReady(cl)).toBe(true);
    });
  });
});

// ════════════════════════════════════════════════════════════════
// CHANGELOG
// ════════════════════════════════════════════════════════════════

describe("change-log", () => {
  describe("generateChangelog", () => {
    it("sorts breaking changes first", () => {
      const cl = generateChangelog("1.0.0", makeEntries());
      expect(cl.entries[0].breakingChange).toBe(true);
    });

    it("preserves all entries", () => {
      const entries = makeEntries();
      const cl = generateChangelog("1.0.0", entries);
      expect(cl.entries).toHaveLength(entries.length);
    });

    it("sets date to YYYY-MM-DD format", () => {
      const cl = generateChangelog("1.0.0", []);
      expect(cl.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe("formatAsMarkdown", () => {
    it("starts with version header", () => {
      const cl = generateChangelog("2.0.0", makeEntries());
      const md = formatAsMarkdown(cl);
      expect(md).toContain("## [2.0.0]");
    });

    it("includes category sections", () => {
      const cl = generateChangelog("2.0.0", makeEntries());
      const md = formatAsMarkdown(cl);
      expect(md).toContain("### Added");
      expect(md).toContain("### Fixed");
      expect(md).toContain("### Changed");
      expect(md).toContain("### Security");
    });

    it("marks breaking changes with BREAKING prefix", () => {
      const cl = generateChangelog("2.0.0", makeEntries());
      const md = formatAsMarkdown(cl);
      expect(md).toContain("**BREAKING:**");
    });

    it("includes issue refs and authors", () => {
      const cl = generateChangelog("2.0.0", makeEntries());
      const md = formatAsMarkdown(cl);
      expect(md).toContain("#101");
      expect(md).toContain("@alice");
    });

    it("includes preamble when provided", () => {
      const cl = generateChangelog("2.0.0", makeEntries(), "Important update!");
      const md = formatAsMarkdown(cl);
      expect(md).toContain("Important update!");
    });
  });

  describe("formatForSlack", () => {
    it("starts with release header", () => {
      const cl = generateChangelog("3.0.0", makeEntries());
      const slack = formatForSlack(cl);
      expect(slack).toContain("*Release 3.0.0*");
    });

    it("uses emoji for categories", () => {
      const cl = generateChangelog("3.0.0", makeEntries());
      const slack = formatForSlack(cl);
      expect(slack).toContain(":sparkles:");
      expect(slack).toContain(":bug:");
    });

    it("marks breaking changes with rotating_light", () => {
      const cl = generateChangelog("3.0.0", makeEntries());
      const slack = formatForSlack(cl);
      expect(slack).toContain(":rotating_light:");
    });
  });

  describe("utility functions", () => {
    it("hasBreakingChanges detects breaking entries", () => {
      const cl = generateChangelog("1.0.0", makeEntries());
      expect(hasBreakingChanges(cl)).toBe(true);
    });

    it("hasBreakingChanges returns false when none", () => {
      const entries = makeEntries().map((e) => ({
        ...e,
        breakingChange: false,
      }));
      const cl = generateChangelog("1.0.0", entries);
      expect(hasBreakingChanges(cl)).toBe(false);
    });

    it("filterByCategory returns only matching entries", () => {
      const cl = generateChangelog("1.0.0", makeEntries());
      const added = filterByCategory(cl, "added");
      expect(added.every((e) => e.category === "added")).toBe(true);
      expect(added).toHaveLength(2);
    });

    it("entrySummary counts entries per category", () => {
      const cl = generateChangelog("1.0.0", makeEntries());
      const summary = entrySummary(cl);
      expect(summary.added).toBe(2);
      expect(summary.fixed).toBe(1);
      expect(summary.changed).toBe(1);
      expect(summary.security).toBe(1);
      expect(summary.deprecated).toBe(0);
      expect(summary.removed).toBe(0);
    });
  });
});
