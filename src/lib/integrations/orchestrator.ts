import { IntegrationProvider } from "@/generated/prisma/client";

export type IntegrationRunMode = "incremental" | "backfill";

interface RunRulesInput {
  mode: IntegrationRunMode;
  providers?: IntegrationProvider[];
  userIds?: string[];
  dryRun: boolean;
  pageBudget?: number;
  startedAt: string;
}

interface RunRulesResult {
  mode: IntegrationRunMode;
  dryRun: boolean;
  startedAt: string;
  finishedAt: string;
  providers: IntegrationProvider[];
  userIds: string[] | null;
  pageBudget: number | null;
  executedRules: number;
}

// Rule orchestration was removed during refactors; keep endpoint operational
// with explicit no-op behavior until rule execution is reintroduced.
export async function runRules(input: RunRulesInput): Promise<RunRulesResult> {
  return {
    mode: input.mode,
    dryRun: input.dryRun,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    providers: input.providers ?? [],
    userIds: input.userIds ?? null,
    pageBudget: input.pageBudget ?? null,
    executedRules: 0,
  };
}
