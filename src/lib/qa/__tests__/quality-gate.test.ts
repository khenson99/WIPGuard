import { describe, it, expect } from "vitest";
import {
  runQualityGate,
  evaluateGateChecks,
  formatGateReport,
  computeCoveragePercentages,
  DEFAULT_COVERAGE_THRESHOLDS,
  type GateCheck,
  type CoverageReport,
  type CriticalPath,
  type QualityGateInput,
} from "@/lib/qa/quality-gate";

// ─── Factory helpers ─────────────────────────────────────────────────

function makeCoverage(overrides: Partial<CoverageReport> = {}): CoverageReport {
  return {
    totalStatements: 100,
    coveredStatements: 80,
    totalBranches: 50,
    coveredBranches: 35,
    totalFunctions: 40,
    coveredFunctions: 32,
    totalLines: 100,
    coveredLines: 80,
    ...overrides,
  };
}

function makeGateCheck(overrides: Partial<GateCheck> = {}): GateCheck {
  return {
    id: "test-check",
    name: "Test Check",
    severity: "high",
    passed: true,
    message: "Check passed",
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("Quality Gate Engine", () => {
  describe("computeCoveragePercentages", () => {
    it("computes correct percentages for all dimensions", () => {
      const pct = computeCoveragePercentages(makeCoverage());

      expect(pct.statements).toBe(80);
      expect(pct.branches).toBe(70);
      expect(pct.functions).toBe(80);
      expect(pct.lines).toBe(80);
    });

    it("returns 100% when total is 0 (no code to cover)", () => {
      const pct = computeCoveragePercentages(
        makeCoverage({
          totalStatements: 0,
          coveredStatements: 0,
          totalBranches: 0,
          coveredBranches: 0,
          totalFunctions: 0,
          coveredFunctions: 0,
          totalLines: 0,
          coveredLines: 0,
        }),
      );

      expect(pct.statements).toBe(100);
      expect(pct.branches).toBe(100);
      expect(pct.functions).toBe(100);
      expect(pct.lines).toBe(100);
    });

    it("rounds to two decimal places", () => {
      const pct = computeCoveragePercentages(
        makeCoverage({
          totalStatements: 3,
          coveredStatements: 1,
        }),
      );

      expect(pct.statements).toBe(33.33);
    });
  });

  describe("evaluateGateChecks", () => {
    it("passes when all checks pass", () => {
      const checks = [
        makeGateCheck({ id: "a", passed: true, severity: "critical" }),
        makeGateCheck({ id: "b", passed: true, severity: "high" }),
      ];

      const result = evaluateGateChecks(checks);
      expect(result.passed).toBe(true);
      expect(result.summary.failed).toBe(0);
    });

    it("fails when any critical check fails", () => {
      const checks = [
        makeGateCheck({ id: "a", passed: true, severity: "high" }),
        makeGateCheck({ id: "b", passed: false, severity: "critical" }),
      ];

      const result = evaluateGateChecks(checks);
      expect(result.passed).toBe(false);
      expect(result.summary.criticalFailures).toBe(1);
    });

    it("passes when only non-critical checks fail", () => {
      const checks = [
        makeGateCheck({ id: "a", passed: true, severity: "critical" }),
        makeGateCheck({ id: "b", passed: false, severity: "medium" }),
        makeGateCheck({ id: "c", passed: false, severity: "low" }),
      ];

      const result = evaluateGateChecks(checks);
      expect(result.passed).toBe(true);
      expect(result.summary.failed).toBe(2);
      expect(result.summary.criticalFailures).toBe(0);
    });

    it("computes summary totals correctly", () => {
      const checks = [
        makeGateCheck({ id: "a", passed: true }),
        makeGateCheck({ id: "b", passed: false, severity: "critical" }),
        makeGateCheck({ id: "c", passed: false, severity: "high" }),
        makeGateCheck({ id: "d", passed: true }),
      ];

      const result = evaluateGateChecks(checks);
      expect(result.summary.total).toBe(4);
      expect(result.summary.passed).toBe(2);
      expect(result.summary.failed).toBe(2);
      expect(result.summary.criticalFailures).toBe(1);
    });
  });

  describe("runQualityGate — coverage threshold checks", () => {
    it("passes when coverage meets all thresholds", () => {
      const result = runQualityGate({
        coverage: makeCoverage({
          totalStatements: 100,
          coveredStatements: 80,
          totalBranches: 50,
          coveredBranches: 35,
          totalFunctions: 40,
          coveredFunctions: 32,
          totalLines: 100,
          coveredLines: 80,
        }),
      });

      const coverageChecks = result.checks.filter((c) =>
        c.id.startsWith("coverage-"),
      );
      expect(coverageChecks.every((c) => c.passed)).toBe(true);
    });

    it("fails when statement coverage is below threshold", () => {
      const result = runQualityGate({
        coverage: makeCoverage({
          totalStatements: 100,
          coveredStatements: 50, // 50% < 70% threshold
        }),
      });

      const stmtCheck = result.checks.find((c) => c.id === "coverage-statements");
      expect(stmtCheck!.passed).toBe(false);
      expect(stmtCheck!.severity).toBe("critical");
    });

    it("uses custom thresholds when provided", () => {
      const result = runQualityGate({
        coverage: makeCoverage({
          totalStatements: 100,
          coveredStatements: 50,
        }),
        coverageThresholds: {
          statements: 40, // Lower threshold
          branches: 30,
          functions: 40,
          lines: 40,
        },
      });

      const stmtCheck = result.checks.find((c) => c.id === "coverage-statements");
      expect(stmtCheck!.passed).toBe(true);
    });

    it("uses default thresholds when none specified", () => {
      expect(DEFAULT_COVERAGE_THRESHOLDS.statements).toBe(70);
      expect(DEFAULT_COVERAGE_THRESHOLDS.branches).toBe(60);
      expect(DEFAULT_COVERAGE_THRESHOLDS.functions).toBe(70);
      expect(DEFAULT_COVERAGE_THRESHOLDS.lines).toBe(70);
    });
  });

  describe("runQualityGate — coverage regression detection", () => {
    it("passes when coverage improves", () => {
      const result = runQualityGate({
        coverage: makeCoverage({ coveredStatements: 85 }),
        previousCoverage: makeCoverage({ coveredStatements: 80 }),
      });

      const regressionChecks = result.checks.filter((c) =>
        c.id.startsWith("regression-"),
      );
      expect(regressionChecks.every((c) => c.passed)).toBe(true);
    });

    it("passes within 2% regression tolerance", () => {
      const result = runQualityGate({
        coverage: makeCoverage({ coveredStatements: 79 }), // 79% vs 80% = -1%
        previousCoverage: makeCoverage({ coveredStatements: 80 }),
      });

      const stmtRegression = result.checks.find(
        (c) => c.id === "regression-statements",
      );
      expect(stmtRegression!.passed).toBe(true);
    });

    it("fails when coverage drops more than 2%", () => {
      const result = runQualityGate({
        coverage: makeCoverage({ coveredStatements: 70 }), // 70% vs 80% = -10%
        previousCoverage: makeCoverage({ coveredStatements: 80 }),
      });

      const stmtRegression = result.checks.find(
        (c) => c.id === "regression-statements",
      );
      expect(stmtRegression!.passed).toBe(false);
      expect(stmtRegression!.message).toContain("dropped");
    });
  });

  describe("runQualityGate — critical path validation", () => {
    it("passes when all critical paths are covered", () => {
      const paths: CriticalPath[] = [
        { id: "login", name: "User login", covered: true, testFile: "auth.test.ts" },
        { id: "insight-note", name: "Insight note", covered: true, testFile: "insights.test.ts" },
      ];

      const result = runQualityGate({ criticalPaths: paths });
      const pathChecks = result.checks.filter((c) =>
        c.id.startsWith("critical-path-"),
      );
      expect(pathChecks.every((c) => c.passed)).toBe(true);
    });

    it("fails when any critical path is uncovered", () => {
      const paths: CriticalPath[] = [
        { id: "login", name: "User login", covered: true },
        { id: "billing", name: "Billing flow", covered: false },
      ];

      const result = runQualityGate({ criticalPaths: paths });
      expect(result.passed).toBe(false);

      const billingCheck = result.checks.find(
        (c) => c.id === "critical-path-billing",
      );
      expect(billingCheck!.passed).toBe(false);
      expect(billingCheck!.severity).toBe("critical");
    });
  });

  describe("runQualityGate — test result checks", () => {
    it("passes when all tests pass", () => {
      const result = runQualityGate({
        testResults: { total: 50, passed: 50, failed: 0, skipped: 0 },
      });

      const failCheck = result.checks.find((c) => c.id === "test-failures");
      expect(failCheck!.passed).toBe(true);
    });

    it("fails when any test fails", () => {
      const result = runQualityGate({
        testResults: { total: 50, passed: 48, failed: 2, skipped: 0 },
      });

      const failCheck = result.checks.find((c) => c.id === "test-failures");
      expect(failCheck!.passed).toBe(false);
      expect(failCheck!.severity).toBe("critical");
    });

    it("warns when skip rate exceeds 10%", () => {
      const result = runQualityGate({
        testResults: { total: 100, passed: 80, failed: 0, skipped: 20 },
      });

      const skipCheck = result.checks.find((c) => c.id === "test-skip-rate");
      expect(skipCheck!.passed).toBe(false);
      expect(skipCheck!.severity).toBe("medium");
    });

    it("accepts skip rate at or below 10%", () => {
      const result = runQualityGate({
        testResults: { total: 100, passed: 90, failed: 0, skipped: 10 },
      });

      const skipCheck = result.checks.find((c) => c.id === "test-skip-rate");
      expect(skipCheck!.passed).toBe(true);
    });
  });

  describe("formatGateReport", () => {
    it("includes PASSED status for passing gate", () => {
      const result = runQualityGate({
        testResults: { total: 10, passed: 10, failed: 0, skipped: 0 },
      });

      expect(result.report).toContain("PASSED");
      expect(result.report).toContain("[PASS]");
    });

    it("includes FAILED status and critical failure count", () => {
      const result = runQualityGate({
        testResults: { total: 10, passed: 8, failed: 2, skipped: 0 },
      });

      expect(result.report).toContain("FAILED");
      expect(result.report).toContain("Critical failures:");
    });

    it("includes check details with severity tags", () => {
      const result = runQualityGate({
        coverage: makeCoverage(),
      });

      expect(result.report).toContain("[CRITICAL]");
      expect(result.report).toContain("[HIGH]");
    });

    it("produces a non-empty report string", () => {
      const result = runQualityGate({});
      expect(result.report).toContain("Quality Gate Report");
    });
  });

  describe("full gate scenario", () => {
    it("runs a comprehensive gate with all input types", () => {
      const input: QualityGateInput = {
        coverage: makeCoverage(),
        coverageThresholds: DEFAULT_COVERAGE_THRESHOLDS,
        previousCoverage: makeCoverage({ coveredStatements: 78 }),
        criticalPaths: [
          { id: "metric-lifecycle", name: "Metric lifecycle", covered: true },
          { id: "policy-enforcement", name: "Policy enforcement", covered: true },
        ],
        testResults: { total: 100, passed: 100, failed: 0, skipped: 2 },
      };

      const result = runQualityGate(input);

      expect(result.passed).toBe(true);
      expect(result.checks.length).toBeGreaterThan(0);
      expect(result.summary.total).toBe(result.checks.length);
      expect(result.report).toContain("Quality Gate Report");
    });
  });
});
