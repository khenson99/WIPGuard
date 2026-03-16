import type { ExpenseCategory, MercuryExpenseMapping } from "@/lib/analytics/types";

const VALID_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  "cogs",
  "payroll",
  "marketing",
  "infrastructure",
  "ops",
  "other",
];

export function normalizeMercuryExpenseMappings(raw: unknown): MercuryExpenseMapping[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];

  const config = raw as { mercuryExpenseMappings?: unknown };
  if (!Array.isArray(config.mercuryExpenseMappings)) return [];

  return config.mercuryExpenseMappings.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const candidate = entry as { match?: unknown; category?: unknown };
    const match = typeof candidate.match === "string" ? candidate.match.trim() : "";
    const category = typeof candidate.category === "string" ? candidate.category.trim().toLowerCase() : "";
    if (!match || !VALID_EXPENSE_CATEGORIES.includes(category as ExpenseCategory)) {
      return [];
    }
    return [{ match, category: category as ExpenseCategory }];
  });
}
