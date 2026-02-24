"use client";

import { useMemo } from "react";
import { ArrowDown } from "lucide-react";

export interface FunnelStageData {
  id: string;
  label: string;
  count: number;
  value: number;
}

interface VisualFunnelProps {
  stages: FunnelStageData[];
  onStageClick?: (stage: FunnelStageData) => void;
}

// Fixed order of stages for the straight path
const MAIN_PATH = [
  "Prospect",
  "Lead",
  "Demo Scheduled",
  "Demo Follow-Up",
  "Budgetary Quote Sent",
  "Payment Link Sent",
  "Subscription",
];

export function VisualFunnel({ stages, onStageClick }: VisualFunnelProps) {
  const stageMap = useMemo(() => {
    const map = new Map<string, FunnelStageData>();
    stages.forEach((s) => map.set(s.label, s));
    return map;
  }, [stages]);

  const maxCount = useMemo(() => {
    let m = 1;
    stages.forEach((s) => {
      if (MAIN_PATH.includes(s.label) && s.count > m) m = s.count;
    });
    return m;
  }, [stages]);

  const mainStages = MAIN_PATH.map((label) => stageMap.get(label)).filter(Boolean) as FunnelStageData[];
  const closedWon = stageMap.get("Closed Won");
  const closedLost = stageMap.get("Closed Lost");

  if (mainStages.length === 0) {
    return <div className="p-8 text-center text-sm text-muted-foreground">No pipeline stages available</div>;
  }

  return (
    <div className="flex w-full flex-col items-center space-y-2 py-6">
      {mainStages.map((stage, idx) => {
        const pct = Math.max((stage.count / maxCount) * 100, 15);
        const hasNext = idx < mainStages.length - 1 || closedWon || closedLost;
        // Find previous count to show conversion
        const prevCount = idx > 0 ? mainStages[idx - 1].count : null;
        const conversion = prevCount ? Math.round((stage.count / prevCount) * 100) : null;

        return (
          <div key={stage.id} className="flex w-full flex-col items-center">
            {/* Conversion indicator above this stage */}
            {conversion !== null && (
              <div className="flex w-full items-center justify-center p-2 text-[10px] text-muted-foreground lg:w-1/2">
                <span className="rounded bg-muted/30 px-2 py-0.5">{conversion}% conversion</span>
              </div>
            )}

            {/* Stage Bar */}
            <div 
              className="group relative flex h-14 cursor-pointer items-center justify-between overflow-hidden rounded-md border border-border/50 bg-card shadow-sm transition-colors hover:border-primary/40 lg:w-1/2"
              style={{ width: `max(300px, ${pct}%)` }}
              onClick={() => onStageClick?.(stage)}
            >
              {/* Background fill */}
              <div className="absolute inset-0 bg-[#fc5a29]/5" />
              <div 
                className="absolute bottom-0 left-0 top-0 bg-[#fc5a29]/20 transition-all group-hover:bg-[#fc5a29]/30"
                style={{ width: `${pct}%` }}
              />
              
              <div className="relative z-10 pl-4 font-medium text-foreground">{stage.label}</div>
              <div className="relative z-10 flex shrink-0 items-center justify-end gap-4 pr-4">
                <div className="text-right">
                  <div className="font-bold tabular-nums text-foreground">{stage.count}</div>
                  <div className="text-[10px] tabular-nums text-muted-foreground lg:text-xs">
                    ${(stage.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                </div>
              </div>
            </div>

            {/* Down Arrow */}
            {hasNext && (
              <div className="py-2 text-muted-foreground/30">
                <ArrowDown className="h-5 w-5" />
              </div>
            )}
          </div>
        );
      })}

      {/* Split path for Won / Lost */}
      {(closedWon || closedLost) && (
        <div className="mt-4 flex w-full max-w-2xl px-4 lg:w-1/2">
          {/* Closed Won Branch */}
          <div className="flex w-1/2 flex-col items-center border-r border-border/50 pr-4">
            <div className="mb-4 h-8 w-px bg-border/50" />
            <div className="w-full rounded-md border-2 border-emerald-500/20 bg-emerald-500/5 p-4 text-center transition-colors hover:border-emerald-500/40">
              <div className="mb-1 text-sm font-semibold text-emerald-600 dark:text-emerald-400">Closed Won</div>
              <div className="text-2xl font-bold tabular-nums text-foreground">{closedWon?.count || 0}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ${(closedWon?.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>

          {/* Closed Lost Branch */}
          <div className="flex w-1/2 flex-col items-center pl-4">
            <div className="mb-4 h-8 w-px bg-border/50" />
            <div className="w-full rounded-md border-2 border-red-500/20 bg-red-500/5 p-4 text-center transition-colors hover:border-red-500/40">
              <div className="mb-1 text-sm font-semibold text-red-600 dark:text-red-400">Closed Lost (inc. Unlikely)</div>
              <div className="text-2xl font-bold tabular-nums text-foreground">{closedLost?.count || 0}</div>
              <div className="text-xs text-muted-foreground tabular-nums">
                ${(closedLost?.value || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
