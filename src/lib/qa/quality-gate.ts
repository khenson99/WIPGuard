// ─── Quality Gate Engine ─────────────────────────────────────────────
//
// Evaluates quality checks for CI gating: coverage thresholds,
// critical path validation, and regression detection.
//
// Pure functions — no side effects, no external dependencies.
// ─────────────────────────────────────────────────────────────────────

// ─── Types ───────────────────────────────────────────────────────────

export type GateSeverity = "critical" | "high" | "medium" | "low";

export interface GateCheck {
  /** Unique identifier for this check */
  id: string;
  /** Human-readable name */
  name: string;
  /** Severity level — critical checks fail the gate */
  severity: GateSeverity;
  /** Whether this check passed */
  passed: boolean;
  /** Detail message (especially useful for failures) */
  message: string;
  /** Optional numeric metric (e.g., coverage percentage) */
  metric?: number;
  /** Optional threshold that the metric was compared against */
  threshold?: number;
}

export interface CoverageReport {
  totalStatements: number;
  coveredStatements: number;
  totalBranches: number;
  coveredBranches: number;
  totalFunctions: number;
  coveredFunctions: number;
  totalLines: number;
  coveredLines: number;
}

export interface CoverageThresholds {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}

export interface CriticalPath {
  /** Identifier for the critical user journey */
  id: string;
  /** Human-readable name */
  name: string;
  /** Whether the path has test coverage */
  covered: boolean;
  /** Test file or suite covering this path */
  testFile?: string;
}

export interface QualityGateInput {
  coverage?: CoverageReport;
  coverageThresholds?: CoverageThresholds;
  criticalPaths?: CriticalPath[];
  previousCoverage?: CoverageReport;
  testResults?: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
}

export interface QualityGateResult {
  /** Overall pass/fail status */
  passed: boolean;
  /** Individual check results */
  checks: GateCheck[];
  /** Summary statistics */
  summary: {
    total: number;
    passed: number;
    failed: number;
    criticalFailures: number;
  };
  /** Human-readable report */
  report: string;
}

// ─── Default thresholds ──────────────────────────────────────────────

export const DEFAULT_COVERAGE_THRESHOLDS: CoverageThresholds = {
  statements: 70,
  branches: 60,
  functions: 70,
  lines: 70,
};

// ─── Coverage helpers ────────────────────────────────────────────────

function computePercentage(covered: number, total: number): number {
  if (total === 0) return 100;
  return Math.round((covered / total) * 10000) / 100;
}

export function computeCoveragePercentages(report: CoverageReport): {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
} {
  return {
    statements: computePercentage(report.coveredStatements, report.totalStatements),
    branches: computePercentage(report.coveredBranches, report.totalBranches),
    functions: computePercentage(report.coveredFunctions, report.totalFunctions),
    lines: computePercentage(report.coveredLines, report.totalLines),
  };
}

// ─── Gate check builders ─────────────────────────────────────────────

function buildCoverageChecks(
  coverage: CoverageReport,
  thresholds: CoverageThresholds,
): GateCheck[] {
  const pct = computeCoveragePercentages(coverage);

  const checks: GateCheck[] = [];
  const dimensions = ["statements", "branches", "functions", "lines"] as const;

  for (const dim of dimensions) {
    const metric = pct[dim];
    const threshold = thresholds[dim];
    const passed = metric >= threshold;

    checks.push({
      id: `coverage-${dim}`,
      name: `${dim.charAt(0).toUpperCase() + dim.slice(1)} coverage`,
      severity: dim === "branches" ? "high" : "critical",
      passed,
      message: passed
        ? `${dim} coverage ${metric}% meets threshold ${threshold}%`
        : `${dim} coverage ${metric}% is below threshold ${threshold}%`,
      metric,
      threshold,
    });
  }

  return checks;
}

function buildCoverageRegressionChecks(
  current: CoverageReport,
  previous: CoverageReport,
): GateCheck[] {
  const currentPct = computeCoveragePercentages(current);
  const previousPct = computeCoveragePercentages(previous);
  const checks: GateCheck[] = [];
  const dimensions = ["statements", "branches", "functions", "lines"] as const;

  for (const dim of dimensions) {
    const delta = currentPct[dim] - previousPct[dim];
    const regression = delta < -2; // 2% regression tolerance

    checks.push({
      id: `regression-${dim}`,
      name: `${dim.charAt(0).toUpperCase() + dim.slice(1)} coverage regression`,
      severity: "high",
      passed: !regression,
      message: regression
        ? `${dim} coverage dropped by ${Math.abs(delta).toFixed(1)}% (${previousPct[dim]}% -> ${currentPct[dim]}%)`
        : `${dim} coverage stable (delta: ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}%)`,
      metric: delta,
      threshold: -2,
    });
  }

  return checks;
}

function buildCriticalPathChecks(paths: CriticalPath[]): GateCheck[] {
  return paths.map((path) => ({
    id: `critical-path-${path.id}`,
    name: `Critical path: ${path.name}`,
    severity: "critical" as GateSeverity,
    passed: path.covered,
    message: path.covered
      ? `${path.name} is covered by ${path.testFile ?? "tests"}`
      : `${path.name} has no test coverage`,
  }));
}

function buildTestResultChecks(results: {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
}): GateCheck[] {
  const checks: GateCheck[] = [];

  checks.push({
    id: "test-failures",
    name: "No test failures",
    severity: "critical",
    passed: results.failed === 0,
    message:
      results.failed === 0
        ? `All ${results.passed} tests passed`
        : `${results.failed} of ${results.total} tests failed`,
    metric: results.failed,
    threshold: 0,
  });

  const skipRate =
    results.total > 0
      ? Math.round((results.skipped / results.total) * 100)
      : 0;

  checks.push({
    id: "test-skip-rate",
    name: "Test skip rate",
    severity: "medium",
    passed: skipRate <= 10,
    message:
      skipRate <= 10
        ? `Skip rate ${skipRate}% is acceptable`
        : `Skip rate ${skipRate}% exceeds 10% threshold`,
    metric: skipRate,
    threshold: 10,
  });

  return checks;
}

// ─── Main gate runner ────────────────────────────────────────────────

/**
 * Evaluate all quality gate checks and produce a result.
 * The gate fails if any critical-severity check fails.
 */
export function evaluateGateChecks(checks: GateCheck[]): QualityGateResult {
  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const criticalFailures = checks.filter(
    (c) => !c.passed && c.severity === "critical",
  ).length;

  const overallPassed = criticalFailures === 0;

  return {
    passed: overallPassed,
    checks,
    summary: {
      total: checks.length,
      passed,
      failed,
      criticalFailures,
    },
    report: formatGateReport({
      passed: overallPassed,
      checks,
      summary: { total: checks.length, passed, failed, criticalFailures },
      report: "",
    }),
  };
}

/**
 * Run the full quality gate with all configured inputs.
 */
export function runQualityGate(input: QualityGateInput): QualityGateResult {
  const checks: GateCheck[] = [];

  // Coverage threshold checks
  if (input.coverage) {
    const thresholds = input.coverageThresholds ?? DEFAULT_COVERAGE_THRESHOLDS;
    checks.push(...buildCoverageChecks(input.coverage, thresholds));
  }

  // Coverage regression checks
  if (input.coverage && input.previousCoverage) {
    checks.push(
      ...buildCoverageRegressionChecks(input.coverage, input.previousCoverage),
    );
  }

  // Critical path checks
  if (input.criticalPaths) {
    checks.push(...buildCriticalPathChecks(input.criticalPaths));
  }

  // Test result checks
  if (input.testResults) {
    checks.push(...buildTestResultChecks(input.testResults));
  }

  return evaluateGateChecks(checks);
}

// ─── Report formatting ───────────────────────────────────────────────

/**
 * Format a quality gate result into a human-readable report.
 */
export function formatGateReport(result: QualityGateResult): string {
  const lines: string[] = [];

  lines.push("═══ Quality Gate Report ═══");
  lines.push("");
  lines.push(`Status: ${result.passed ? "PASSED" : "FAILED"}`);
  lines.push(
    `Checks: ${result.summary.passed}/${result.summary.total} passed`,
  );

  if (result.summary.criticalFailures > 0) {
    lines.push(
      `Critical failures: ${result.summary.criticalFailures}`,
    );
  }

  lines.push("");
  lines.push("─── Details ───");

  for (const check of result.checks) {
    const icon = check.passed ? "[PASS]" : "[FAIL]";
    const severity = `[${check.severity.toUpperCase()}]`;
    lines.push(`${icon} ${severity} ${check.name}: ${check.message}`);
  }

  lines.push("");
  lines.push("═══════════════════════════");

  return lines.join("\n");
}
