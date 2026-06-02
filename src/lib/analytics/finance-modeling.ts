// ─── Finance Modeling Engine ─────────────────────────────
// Pure functions for seed-stage startup financial projections,
// scenario modeling, goal tracking, sensitivity analysis, and health scoring.
// All computations derive from the existing AnalyticsDashboardData type.

import type { AnalyticsDashboardData } from "@/lib/analytics/types";
import { normalizePercentValue } from "@/lib/analytics/percentage-utils";
import { buildSubscriptionMrrBreakdown } from "@/lib/analytics/subscription-mrr";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

export interface MrrProjection {
  /** 0 = current month, 1 = next month, etc. */
  month: number;
  label: string;
  mrr: number;
  newMrr: number;
  churnedMrr: number;
  cumulative: number;
}

export interface RunwayScenarioPoint {
  month: number;
  cash: number;
}

export interface RunwayScenario {
  label: string;
  monthlyBurn: number;
  monthlyInflow: number;
  runway: number;
  zeroDate: string | null;
  projectedCash: RunwayScenarioPoint[];
}

export interface FinancialGoal {
  id: string;
  label: string;
  target: number;
  current: number;
  unit: "currency" | "percent" | "months" | "number";
  progress: number;
  projectedDate: string | null;
  onTrack: boolean;
  suggestion: string;
}

export interface SensitivityAdjustment {
  churnDelta: number;
  growthDelta: number;
  burnDelta: number;
}

export interface SensitivityResult {
  parameter: string;
  baseValue: number;
  adjustedValue: number;
  impactOnRunway: number;
  impactOnMrr12m: number;
  description: string;
}

export interface HealthComponent {
  label: string;
  score: number;
  weight: number;
  detail: string;
}

export interface HealthSuggestion {
  priority: number;
  title: string;
  action: string;
  expectedImpact: string;
  relatedTab?: string;
}

export interface FinanceHealthScore {
  overall: number;
  grade: "A" | "B" | "C" | "D" | "F";
  components: HealthComponent[];
  topSuggestions: HealthSuggestion[];
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════ */

function monthLabel(offset: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offset);
  return d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function nextRoundNumber(n: number): number {
  if (n <= 0) return 1000;
  if (n < 1000) return 1000;
  if (n < 5000) return 5000;
  if (n < 10_000) return 10_000;
  if (n < 25_000) return 25_000;
  if (n < 50_000) return 50_000;
  if (n < 100_000) return 100_000;
  // For larger values, next power-of-10 boundary
  const magnitude = Math.pow(10, Math.floor(Math.log10(n)));
  const next = Math.ceil(n / magnitude) * magnitude;
  return next === n ? next + magnitude : next;
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

function percentRate(value: number | null | undefined): number {
  return normalizePercentValue(value) / 100;
}

function canonicalMrr(data: AnalyticsDashboardData): number {
  return buildSubscriptionMrrBreakdown({
    stripe: data.stripe,
    hubspot: data.hubspot,
  }).totalMrr;
}

/* ═══════════════════════════════════════════════════════════
   1. MRR PROJECTIONS
   ═══════════════════════════════════════════════════════════ */

export function projectMrr(
  data: AnalyticsDashboardData,
  months: number = 12,
): MrrProjection[] {
  const currentMrr = canonicalMrr(data);
  // revenueGrowth is a percentage value (e.g. 12.5 for 12.5%)
  const monthlyGrowthRate = (data.stripe?.revenue?.revenueGrowth ?? 0) / 100;
  // churnRate is also a percentage (e.g. 5.2 for 5.2%)
  const monthlyChurnRate = percentRate(data.stripe?.subscriptions?.churnRate);

  const projections: MrrProjection[] = [];
  let mrr = currentMrr;
  let cumulative = 0;

  for (let i = 0; i <= months; i++) {
    if (i === 0) {
      projections.push({
        month: 0,
        label: monthLabel(0),
        mrr: currentMrr,
        newMrr: 0,
        churnedMrr: 0,
        cumulative: currentMrr,
      });
      cumulative = currentMrr;
      continue;
    }

    const newMrr = mrr * monthlyGrowthRate;
    const churnedMrr = mrr * monthlyChurnRate;
    mrr = Math.max(0, mrr + newMrr - churnedMrr);
    cumulative += mrr;

    projections.push({
      month: i,
      label: monthLabel(i),
      mrr,
      newMrr,
      churnedMrr,
      cumulative,
    });
  }

  return projections;
}

/* ═══════════════════════════════════════════════════════════
   2. RUNWAY SCENARIOS
   ═══════════════════════════════════════════════════════════ */

export function buildRunwayScenarios(
  data: AnalyticsDashboardData,
  months: number = 24,
): RunwayScenario[] {
  const totalBalance = data.mercury?.cashFlow?.totalBalance ?? 0;
  const currentOutflows = data.mercury?.cashFlow?.outflows30d ?? 0;
  const currentInflows = data.mercury?.cashFlow?.inflows30d ?? 0;

  const scenarios: { label: string; burnMultiplier: number; inflowMultiplier: number }[] = [
    { label: "Best Case", burnMultiplier: 0.8, inflowMultiplier: 1.2 },
    { label: "Expected", burnMultiplier: 1.0, inflowMultiplier: 1.0 },
    { label: "Worst Case", burnMultiplier: 1.3, inflowMultiplier: 0.7 },
  ];

  return scenarios.map(({ label, burnMultiplier, inflowMultiplier }) => {
    const monthlyBurn = currentOutflows * burnMultiplier;
    const monthlyInflow = currentInflows * inflowMultiplier;
    const projectedCash: RunwayScenarioPoint[] = [];
    let cash = totalBalance;
    let runway = 0;
    let zeroDate: string | null = null;

    for (let i = 0; i <= months; i++) {
      projectedCash.push({ month: i, cash: Math.max(cash, 0) });

      if (i > 0 && cash < 0 && !zeroDate) {
        zeroDate = addMonths(new Date(), i).toISOString().slice(0, 10);
        runway = i;
      }

      const netBurn = monthlyBurn - monthlyInflow;
      cash -= netBurn;
    }

    // If never hit zero
    if (!zeroDate) {
      if (monthlyBurn <= monthlyInflow) {
        runway = Infinity;
      } else {
        const netBurn = monthlyBurn - monthlyInflow;
        runway = netBurn > 0 ? totalBalance / netBurn : Infinity;
      }
    }

    return {
      label,
      monthlyBurn,
      monthlyInflow,
      runway: Number.isFinite(runway) ? runway : 999,
      zeroDate,
      projectedCash,
    };
  });
}

/* ═══════════════════════════════════════════════════════════
   3. FINANCIAL GOALS
   ═══════════════════════════════════════════════════════════ */

export function computeFinancialGoals(
  data: AnalyticsDashboardData,
): FinancialGoal[] {
  const goals: FinancialGoal[] = [];
  const mrr = canonicalMrr(data);
  const growthRate = (data.stripe?.revenue?.revenueGrowth ?? 0) / 100;
  const churnRate = percentRate(data.stripe?.subscriptions?.churnRate);
  const runway = data.mercury?.cashFlow?.runway ?? 0;
  const burnRate = data.mercury?.cashFlow?.burnRate ?? 0;
  const totalBalance = data.mercury?.cashFlow?.totalBalance ?? 0;
  const avgRevenuePerCustomer = data.stripe?.revenue?.avgRevenuePerCustomer ?? 0;
  const paymentSuccessRate = normalizePercentValue(data.stripe?.payments?.successRate);

  // Goal 1: MRR Milestone
  if (mrr > 0) {
    const target = nextRoundNumber(mrr);
    const netGrowthRate = growthRate - churnRate;
    let projectedMonths: number | null = null;

    if (netGrowthRate > 0) {
      // mrr * (1 + netGrowthRate)^n = target → n = log(target/mrr) / log(1+netGrowthRate)
      projectedMonths = Math.ceil(Math.log(target / mrr) / Math.log(1 + netGrowthRate));
    }

    const projectedDate = projectedMonths
      ? addMonths(new Date(), projectedMonths).toISOString().slice(0, 10)
      : null;

    goals.push({
      id: "mrr-milestone",
      label: `Reach $${(target / 1000).toFixed(0)}K MRR`,
      target,
      current: mrr,
      unit: "currency",
      progress: clamp((mrr / target) * 100, 0, 100),
      projectedDate,
      onTrack: netGrowthRate > 0,
      suggestion: netGrowthRate > 0
        ? `At ${(netGrowthRate * 100).toFixed(1)}% net growth, you'll hit this in ~${projectedMonths} months. Focus on reducing churn to accelerate.`
        : "Net growth is negative. Prioritize churn reduction and new customer acquisition to resume growth.",
    });
  }

  // Goal 2: Runway Extension (if < 18 months)
  if (runway > 0 && runway < 18 && burnRate > 0) {
    const targetRunway = 18;
    // To reach 18mo: need totalBalance / targetRunway >= burnRate
    // Required burn = totalBalance / targetRunway
    const requiredBurn = totalBalance / targetRunway;
    const burnReduction = burnRate - requiredBurn;

    goals.push({
      id: "runway-extension",
      label: "Extend runway to 18 months",
      target: targetRunway,
      current: runway,
      unit: "months",
      progress: clamp((runway / targetRunway) * 100, 0, 100),
      projectedDate: null,
      onTrack: runway >= 12,
      suggestion: burnReduction > 0
        ? `Reduce monthly burn by $${Math.round(burnReduction).toLocaleString()} (${((burnReduction / burnRate) * 100).toFixed(0)}%) or raise additional capital.`
        : "On track — maintain current burn discipline.",
    });
  }

  // Goal 3: Churn Target (if above 5%)
  if (churnRate > 0.05) {
    const targetChurn = 0.03;
    // Invert progress: lower is better
    const progress = churnRate <= targetChurn
      ? 100
      : clamp(((1 - (churnRate - targetChurn) / churnRate) * 100), 0, 99);

    goals.push({
      id: "churn-target",
      label: "Reduce churn below 3%",
      target: targetChurn * 100,
      current: churnRate * 100,
      unit: "percent",
      progress,
      projectedDate: null,
      onTrack: churnRate < 0.05,
      suggestion: `Current churn at ${(churnRate * 100).toFixed(1)}%. Implement win-back campaigns, improve onboarding, and survey churned customers to identify patterns.`,
    });
  }

  // Goal 4: Payment Success Rate (if below 98%)
  if (paymentSuccessRate > 0 && paymentSuccessRate < 98) {
    goals.push({
      id: "payment-success",
      label: "Reach 98% payment success",
      target: 98,
      current: paymentSuccessRate,
      unit: "percent",
      progress: clamp((paymentSuccessRate / 98) * 100, 0, 100),
      projectedDate: null,
      onTrack: paymentSuccessRate >= 95,
      suggestion: "Enable smart retries, send dunning emails for failed payments, and encourage customers to update payment methods.",
    });
  }

  // Goal 5: ARPC Growth (if data exists)
  if (avgRevenuePerCustomer > 0 && mrr > 0) {
    const targetArpc = avgRevenuePerCustomer * 1.25; // 25% growth target
    goals.push({
      id: "arpc-growth",
      label: "Increase ARPC by 25%",
      target: targetArpc,
      current: avgRevenuePerCustomer,
      unit: "currency",
      progress: clamp((avgRevenuePerCustomer / targetArpc) * 100, 0, 100),
      projectedDate: null,
      onTrack: growthRate > churnRate,
      suggestion: "Introduce usage-based pricing tiers, offer annual plan discounts, and upsell existing customers to higher plans.",
    });
  }

  return goals;
}

/* ═══════════════════════════════════════════════════════════
   4. SENSITIVITY ANALYSIS
   ═══════════════════════════════════════════════════════════ */

export function runSensitivityAnalysis(
  data: AnalyticsDashboardData,
  adjustments: SensitivityAdjustment = { churnDelta: -0.02, growthDelta: 0.05, burnDelta: -0.1 },
): SensitivityResult[] {
  const results: SensitivityResult[] = [];
  const currentMrr = canonicalMrr(data);
  const growthRate = (data.stripe?.revenue?.revenueGrowth ?? 0) / 100;
  const churnRate = percentRate(data.stripe?.subscriptions?.churnRate);
  const burnRate = data.mercury?.cashFlow?.burnRate ?? 0;
  const totalBalance = data.mercury?.cashFlow?.totalBalance ?? 0;

  // Helper: compute 12-month MRR from rates
  function mrrAt12(growth: number, churn: number): number {
    let mrr = currentMrr;
    for (let i = 0; i < 12; i++) {
      mrr = Math.max(0, mrr * (1 + growth) * (1 - churn));
    }
    return mrr;
  }

  // Helper: compute runway from burn
  function runwayFromBurn(burn: number): number {
    if (burn <= 0) return 999;
    return totalBalance / burn;
  }

  const baseMrr12 = mrrAt12(growthRate, churnRate);
  const baseRunway = runwayFromBurn(burnRate);

  // Churn adjustment
  const adjChurn = clamp(churnRate + adjustments.churnDelta, 0, 1);
  const adjMrr12Churn = mrrAt12(growthRate, adjChurn);
  const churnDirection = adjustments.churnDelta < 0 ? "Reducing" : "Increasing";
  results.push({
    parameter: "Churn Rate",
    baseValue: churnRate * 100,
    adjustedValue: adjChurn * 100,
    impactOnRunway: 0, // Churn doesn't directly affect cash runway in this model
    impactOnMrr12m: adjMrr12Churn - baseMrr12,
    description: `${churnDirection} churn by ${Math.abs(adjustments.churnDelta * 100).toFixed(1)}pp → MRR impact of ${adjMrr12Churn - baseMrr12 >= 0 ? "+" : ""}$${Math.round(adjMrr12Churn - baseMrr12).toLocaleString()} at month 12`,
  });

  // Growth adjustment
  const adjGrowth = Math.max(growthRate + adjustments.growthDelta, -1);
  const adjMrr12Growth = mrrAt12(adjGrowth, churnRate);
  const growthDirection = adjustments.growthDelta > 0 ? "Increasing" : "Decreasing";
  results.push({
    parameter: "Growth Rate",
    baseValue: growthRate * 100,
    adjustedValue: adjGrowth * 100,
    impactOnRunway: 0,
    impactOnMrr12m: adjMrr12Growth - baseMrr12,
    description: `${growthDirection} growth by ${Math.abs(adjustments.growthDelta * 100).toFixed(1)}pp → MRR impact of ${adjMrr12Growth - baseMrr12 >= 0 ? "+" : ""}$${Math.round(adjMrr12Growth - baseMrr12).toLocaleString()} at month 12`,
  });

  // Burn adjustment
  const adjBurn = Math.max(burnRate * (1 + adjustments.burnDelta), 0);
  const adjRunway = runwayFromBurn(adjBurn);
  const burnDirection = adjustments.burnDelta < 0 ? "Reducing" : "Increasing";
  results.push({
    parameter: "Burn Rate",
    baseValue: burnRate,
    adjustedValue: adjBurn,
    impactOnRunway: adjRunway - baseRunway,
    impactOnMrr12m: 0, // Burn doesn't directly affect MRR
    description: `${burnDirection} burn by ${Math.abs(adjustments.burnDelta * 100).toFixed(0)}% → ${adjRunway - baseRunway >= 0 ? "+" : ""}${(adjRunway - baseRunway).toFixed(1)} months runway`,
  });

  return results;
}

/* ═══════════════════════════════════════════════════════════
   5. FINANCIAL HEALTH SCORE
   ═══════════════════════════════════════════════════════════ */

function scoreRunway(months: number): number {
  if (months >= 24) return 100;
  if (months >= 18) return 90;
  if (months >= 12) return 75;
  if (months >= 6) return 45;
  if (months >= 3) return 20;
  return 5;
}

function scoreGrowth(rate: number): number {
  // rate is a decimal (e.g. 0.15 for 15%)
  if (rate >= 0.20) return 100;
  if (rate >= 0.15) return 90;
  if (rate >= 0.10) return 75;
  if (rate >= 0.05) return 55;
  if (rate >= 0) return 30;
  return 10;
}

function scoreChurn(rate: number): number {
  // rate is a decimal (e.g. 0.05 for 5%)
  if (rate <= 0.02) return 100;
  if (rate <= 0.03) return 85;
  if (rate <= 0.05) return 65;
  if (rate <= 0.08) return 40;
  if (rate <= 0.12) return 20;
  return 5;
}

function scorePaymentSuccess(rate: number): number {
  // rate is already 0-100
  if (rate >= 99) return 100;
  if (rate >= 97) return 85;
  if (rate >= 95) return 65;
  if (rate >= 90) return 40;
  return 15;
}

function scorePipelineCoverage(data: AnalyticsDashboardData): number {
  const pipeline = data.hubspot?.funnel;
  if (!pipeline) return 50; // Neutral if no data
  const mrr = canonicalMrr(data);
  if (mrr === 0) return 50;
  // Pipeline value vs annual MRR
  const annualMrr = mrr * 12;
  const totalPipelineValue = pipeline.stages.reduce((sum, s) => sum + s.value, 0);
  const coverage = totalPipelineValue / annualMrr;
  if (coverage >= 3) return 100;
  if (coverage >= 2) return 80;
  if (coverage >= 1) return 60;
  if (coverage >= 0.5) return 35;
  return 15;
}

export function scoreFinancialHealth(
  data: AnalyticsDashboardData,
): FinanceHealthScore {
  const runway = data.mercury?.cashFlow?.runway ?? 0;
  const growthRate = (data.stripe?.revenue?.revenueGrowth ?? 0) / 100;
  const churnRate = percentRate(data.stripe?.subscriptions?.churnRate);
  const paymentSuccess = normalizePercentValue(data.stripe?.payments?.successRate);

  const components: HealthComponent[] = [
    {
      label: "Runway",
      score: scoreRunway(runway),
      weight: 0.30,
      detail: runway > 0 ? `${runway.toFixed(1)} months` : "No data",
    },
    {
      label: "MRR Growth",
      score: scoreGrowth(growthRate),
      weight: 0.25,
      detail: `${(growthRate * 100).toFixed(1)}% monthly`,
    },
    {
      label: "Churn",
      score: scoreChurn(churnRate),
      weight: 0.20,
      detail: `${(churnRate * 100).toFixed(1)}% monthly`,
    },
    {
      label: "Payment Success",
      score: scorePaymentSuccess(paymentSuccess),
      weight: 0.10,
      detail: `${paymentSuccess.toFixed(1)}%`,
    },
    {
      label: "Pipeline Coverage",
      score: scorePipelineCoverage(data),
      weight: 0.15,
      detail: data.hubspot ? "Active" : "No data",
    },
  ];

  const overall = Math.round(
    components.reduce((sum, c) => sum + c.score * c.weight, 0),
  );

  const grade: FinanceHealthScore["grade"] =
    overall >= 85 ? "A" : overall >= 70 ? "B" : overall >= 55 ? "C" : overall >= 40 ? "D" : "F";

  // Generate suggestions from weakest components
  const sorted = [...components].sort((a, b) => a.score - b.score);
  const topSuggestions: HealthSuggestion[] = [];

  for (const comp of sorted) {
    if (comp.score >= 80 || topSuggestions.length >= 4) break;

    if (comp.label === "Runway" && comp.score < 80) {
      topSuggestions.push({
        priority: topSuggestions.length + 1,
        title: "Extend Cash Runway",
        action: "Reduce non-essential expenses, negotiate longer payment terms with vendors, or accelerate fundraising timeline.",
        expectedImpact: "Each 10% burn reduction adds ~2-3 months of runway.",
        relatedTab: "finance-mercury",
      });
    }
    if (comp.label === "MRR Growth" && comp.score < 80) {
      topSuggestions.push({
        priority: topSuggestions.length + 1,
        title: "Accelerate Revenue Growth",
        action: "Increase top-of-funnel through paid acquisition, launch referral programs, and optimize trial-to-paid conversion.",
        expectedImpact: "Each 5pp growth improvement compounds to 80%+ more MRR over 12 months.",
        relatedTab: "finance-stripe",
      });
    }
    if (comp.label === "Churn" && comp.score < 80) {
      topSuggestions.push({
        priority: topSuggestions.length + 1,
        title: "Reduce Customer Churn",
        action: "Implement health scoring, proactive outreach to at-risk accounts, and exit surveys. Fix top 3 reasons customers leave.",
        expectedImpact: "Reducing churn by 2pp can double your effective growth rate.",
        relatedTab: "finance-stripe",
      });
    }
    if (comp.label === "Payment Success" && comp.score < 80) {
      topSuggestions.push({
        priority: topSuggestions.length + 1,
        title: "Improve Payment Recovery",
        action: "Enable smart retries in Stripe, implement dunning email sequences, and prompt card updates before expiration.",
        expectedImpact: "Recovering even 50% of failed payments prevents involuntary churn.",
        relatedTab: "finance-stripe",
      });
    }
    if (comp.label === "Pipeline Coverage" && comp.score < 80) {
      topSuggestions.push({
        priority: topSuggestions.length + 1,
        title: "Build Sales Pipeline",
        action: "Increase outbound activity, invest in content marketing for inbound leads, and optimize your demo-to-close conversion.",
        expectedImpact: "3x pipeline coverage is the minimum for predictable revenue growth.",
        relatedTab: "finance-hubspot",
      });
    }
  }

  return { overall, grade, components, topSuggestions };
}
