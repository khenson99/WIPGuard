"use client";

import { CalendarCheck, CalendarClock, CalendarDays, Users } from "lucide-react";
import type { ConferenceStats } from "@/lib/conferences/compute-conference-stats";

interface ConferenceStatCardsProps {
  stats: ConferenceStats;
}

interface StatCardDef {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
}

function StatCard({ label, value, icon, color }: StatCardDef) {
  return (
    <div
      role="region"
      aria-label={`${label}: ${value}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3"
    >
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
        style={{ backgroundColor: `${color}18` }}
        aria-hidden="true"
      >
        <span style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-lg font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export function ConferenceStatCards({ stats }: ConferenceStatCardsProps) {
  const cards: StatCardDef[] = [
    {
      label: "Total",
      value: stats.total,
      icon: <CalendarDays className="h-4 w-4" />,
      color: "var(--primary)",
    },
    {
      label: "Upcoming",
      value: stats.upcoming,
      icon: <CalendarClock className="h-4 w-4" />,
      color: "#22c55e",
    },
    {
      label: "In Progress",
      value: stats.inProgress,
      icon: <CalendarClock className="h-4 w-4" />,
      color: "#f59e0b",
    },
    {
      label: "Past",
      value: stats.past,
      icon: <CalendarCheck className="h-4 w-4" />,
      color: "#3b82f6",
    },
    {
      label: "Total Leads",
      value: stats.totalLeads,
      icon: <Users className="h-4 w-4" />,
      color: "#8b5cf6",
    },
  ];

  return (
    <section aria-label="Conference summary statistics">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>
    </section>
  );
}
