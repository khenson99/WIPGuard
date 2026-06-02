import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import type { WorkspacePageModel } from "./workspace-model";

function WorkspaceActionLink({ action, primary = false }: { action: { href: string; label: string }; primary?: boolean }) {
  return (
    <Link
      href={action.href}
      className={
        primary
          ? "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground"
          : "inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
      }
    >
      {action.label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

export function WorkspaceHome({ model }: { model: WorkspacePageModel }) {
  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mx-auto max-w-6xl space-y-5">
        <section className="border-b border-border pb-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {model.eyebrow}
          </p>
          <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-3xl">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                {model.title}
              </h1>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                {model.summary}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {model.primaryAction ? <WorkspaceActionLink action={model.primaryAction} primary /> : null}
              {model.secondaryAction ? <WorkspaceActionLink action={model.secondaryAction} /> : null}
            </div>
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {model.stats.map((stat) => (
            <article key={stat.label} className="rounded-lg border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className="mt-2 text-2xl font-semibold text-foreground">{stat.value}</p>
              {stat.detail ? (
                <p className="mt-2 text-xs leading-5 text-muted-foreground">{stat.detail}</p>
              ) : null}
            </article>
          ))}
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">System Of Record</h2>
            {model.records.map((record) => (
              <article key={record.title} className="rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{record.title}</h3>
                    <p className="mt-1 text-xs leading-5 text-muted-foreground">
                      {record.description}
                    </p>
                  </div>
                  {record.href && record.label ? (
                    <Link
                      href={record.href}
                      className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                    >
                      {record.label}
                      <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </article>
            ))}
          </div>

          <aside className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-semibold text-foreground">Preserved Infrastructure</h2>
            <div className="mt-3 space-y-2">
              {model.preservedSystems.map((system) => (
                <div key={system} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  <span>{system}</span>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </div>
    </div>
  );
}
