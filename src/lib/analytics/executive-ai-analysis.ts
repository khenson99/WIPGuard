// Executive AI Analysis — generates narrative financial analysis and
// recommendations from monthly P&L history and current KPIs using an LLM.

import OpenAI from "openai";
import type { MonthlyPnLHistory } from "./monthly-pnl-history";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ExecutiveAnalysis {
  /** 2-3 paragraph executive narrative */
  narrative: string;
  /** Revenue, margin, and expense trends */
  trendAnalysis: TrendItem[];
  /** Prioritized risk flags */
  risks: RiskItem[];
  /** Actionable recommendations */
  recommendations: RecommendationItem[];
  /** ISO timestamp of when this analysis was generated */
  generatedAt: string;
}

export interface TrendItem {
  metric: string;
  direction: "improving" | "declining" | "stable";
  summary: string;
}

export interface RiskItem {
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
}

export interface RecommendationItem {
  priority: "P0" | "P1" | "P2";
  title: string;
  description: string;
  expectedImpact: string;
}

// ---------------------------------------------------------------------------
// OpenAI client
// ---------------------------------------------------------------------------

let client: OpenAI | null = null;

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured — executive AI analysis unavailable");
  }
  if (!client) {
    client = new OpenAI({ apiKey });
  }
  return client;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildFinancialContext(history: MonthlyPnLHistory): string {
  const months = history.months;
  if (months.length === 0) return "No monthly financial data available.";

  const latest = months[months.length - 1];
  const lines: string[] = [];

  lines.push(`## Monthly P&L History (${months.length} months)\n`);
  lines.push("| Month | Revenue | COGS | Gross Profit | Gross Margin | OpEx | Net Income | MRR | Cash | Burn Rate | Churn |");
  lines.push("|-------|---------|------|-------------|-------------|------|-----------|-----|------|-----------|-------|");

  for (const m of months) {
    lines.push(
      `| ${m.month} | $${m.revenue.toLocaleString()} | $${m.cogs.toLocaleString()} | $${m.grossProfit.toLocaleString()} | ${m.grossMarginPct}% | $${m.totalOpex.toLocaleString()} | $${m.netIncome.toLocaleString()} | ${m.mrr != null ? `$${m.mrr.toLocaleString()}` : "N/A"} | ${m.cashBalance != null ? `$${m.cashBalance.toLocaleString()}` : "N/A"} | ${m.burnRate != null ? `$${m.burnRate.toLocaleString()}` : "N/A"} | ${m.churnRate != null ? `${m.churnRate.toFixed(1)}%` : "N/A"} |`,
    );
  }

  if (history.latestMoM) {
    const mom = history.latestMoM;
    lines.push(`\n## Latest Month-over-Month Changes`);
    lines.push(`- Revenue: ${mom.revenueChangePct >= 0 ? "+" : ""}${mom.revenueChangePct}% ($${mom.revenueChange.toLocaleString()})`);
    lines.push(`- Net Income: ${mom.netIncomeChangePct >= 0 ? "+" : ""}${mom.netIncomeChangePct}% ($${mom.netIncomeChange.toLocaleString()})`);
    lines.push(`- Gross Margin: ${mom.grossMarginChange >= 0 ? "+" : ""}${mom.grossMarginChange}pp`);
    if (mom.burnRateChange != null) {
      lines.push(`- Burn Rate: ${mom.burnRateChange >= 0 ? "+" : ""}$${mom.burnRateChange.toLocaleString()}`);
    }
  }

  // Expense breakdown for latest month
  lines.push(`\n## Latest Month Expense Breakdown (${latest.month})`);
  lines.push(`- Payroll & Compensation: $${latest.operatingExpenses.payroll.toLocaleString()}`);
  lines.push(`- Marketing & Sales: $${latest.operatingExpenses.marketing.toLocaleString()}`);
  lines.push(`- Infrastructure & Tools: $${latest.operatingExpenses.infrastructure.toLocaleString()}`);
  lines.push(`- General & Administrative: $${latest.operatingExpenses.ops.toLocaleString()}`);

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are a senior financial analyst providing an executive briefing for a startup CEO.
You analyze monthly P&L statements, operating metrics, and financial trends to provide actionable insights.

Your analysis must be:
- Data-driven: cite specific numbers and trends from the data
- Concise: executives have limited time
- Actionable: every insight should lead to a clear next step
- Honest: flag real risks without sugarcoating

Respond ONLY with valid JSON matching this schema:
{
  "narrative": "2-3 paragraph executive summary of financial performance, what happened, why it matters, and top priorities",
  "trendAnalysis": [
    { "metric": "string", "direction": "improving|declining|stable", "summary": "1-2 sentence explanation" }
  ],
  "risks": [
    { "severity": "critical|warning|info", "title": "short title", "description": "1-2 sentence explanation" }
  ],
  "recommendations": [
    { "priority": "P0|P1|P2", "title": "short title", "description": "what to do", "expectedImpact": "expected outcome" }
  ]
}

Guidelines:
- Include 3-5 trend items covering revenue, margins, burn, churn, and cash
- Include 2-4 risks ranked by severity
- Include 3-5 recommendations ranked by priority (P0 = do this week)
- Narrative should be 2-3 paragraphs, professional but direct
- If data is limited (few months), note that projections have low confidence`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function generateExecutiveAnalysis(
  history: MonthlyPnLHistory,
): Promise<ExecutiveAnalysis> {
  const client = getClient();
  const financialContext = buildFinancialContext(history);

  const response = await client.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: `Analyze the following financial data and provide your executive briefing:\n\n${financialContext}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 2000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from AI analysis");
  }

  const parsed = JSON.parse(content) as {
    narrative: string;
    trendAnalysis: TrendItem[];
    risks: RiskItem[];
    recommendations: RecommendationItem[];
  };

  return {
    narrative: parsed.narrative,
    trendAnalysis: parsed.trendAnalysis ?? [],
    risks: parsed.risks ?? [],
    recommendations: parsed.recommendations ?? [],
    generatedAt: new Date().toISOString(),
  };
}
