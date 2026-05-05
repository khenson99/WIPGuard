import Link from "next/link";
import {
  ArrowRight,
  CalendarRange,
  Cable,
  Gauge,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
} from "lucide-react";

const metrics = [
  {
    label: "Source trust",
    value: "Freshness, lineage, and warnings stay attached to every number",
  },
  {
    label: "Board packs",
    value: "Weekly exec, board, investor, and custom snapshots reuse the same facts",
  },
  {
    label: "Live integrations",
    value: "Finance, CRM, ads, web, CS, and workspace systems meet in one API layer",
  },
];

const painPoints = [
  {
    icon: Gauge,
    title: "Metric drift",
    body:
      "The same number changes across dashboards, exports, and meetings because every surface recalculates it differently.",
  },
  {
    icon: Workflow,
    title: "Disconnected sources",
    body:
      "Finance, CRM, ads, customer success, and workspace systems each hold part of the story with different timestamps.",
  },
  {
    icon: Cable,
    title: "Manual board prep",
    body:
      "Weekly meetings and board packets become spreadsheet archaeology when freshness, lineage, and warnings are detached.",
  },
];

const operatingModel = [
  {
    step: "01",
    title: "Ingest source snapshots",
    body:
      "Each provider lands in one analytics API layer with source timestamps, sync health, and raw snapshot lineage.",
  },
  {
    step: "02",
    title: "Compute canonical metrics",
    body:
      "Reusable calculators produce one governed value for dashboards, exports, investor updates, and board materials.",
  },
  {
    step: "03",
    title: "Label trust state",
    body:
      "Every metric carries freshness, confidence, warnings, calculation version, and cited source snapshots.",
  },
  {
    step: "04",
    title: "Reuse locked facts",
    body:
      "The CEO command center and report packs use the same locked values so meeting narratives do not diverge.",
  },
];

const roleCards = [
  {
    title: "CEO / Founder",
    body: "Walk into weekly and board conversations with current numbers, visible caveats, and cited sources.",
  },
  {
    title: "Marketing",
    body: "Tie traffic, campaigns, and conference signals back to demo and revenue motion without copy-paste reporting.",
  },
  {
    title: "Sales",
    body: "Read pipeline metrics beside revenue, source health, and customer journey context.",
  },
  {
    title: "Customer Success / Ops",
    body: "Surface account risk and source gaps before they distort executive reporting.",
  },
];

export function HomeLanding() {
  return (
    <div className="min-h-screen bg-[#efefef] text-[#080808]">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="text-lg font-semibold tracking-tight">
            WIPGuard
          </Link>
          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="#how-it-works"
              className="rounded-full px-3 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
            >
              How it works
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-[#fc5a29] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#e64b1c]"
            >
              Access workspace
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_top_right,_rgba(252,90,41,0.18),_transparent_45%),radial-gradient(circle_at_left,_rgba(0,0,0,0.12),_transparent_35%)]" />
          <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div className="relative space-y-8">
              <span className="inline-flex rounded-full bg-black px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white">
                Invite-only for Arda GTM and beta teams
              </span>

              <div className="space-y-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-black/45">
                  Analytics API meeting place
                </p>
                <h1 className="max-w-3xl text-4xl font-semibold tracking-tight text-[#080808] sm:text-5xl lg:text-6xl">
                  Make every business metric traceable.
                </h1>
                <p className="max-w-2xl text-base leading-7 text-black/65 sm:text-lg">
                  WIPGuard brings finance, sales, marketing, customer success,
                  and internal execution sources into one governed metric layer
                  with freshness, lineage, and board-ready exports.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/login"
                  className="inline-flex items-center gap-2 rounded-full bg-[#fc5a29] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#e64b1c]"
                >
                  Access workspace
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="#how-it-works"
                  className="rounded-full border border-black/15 bg-white px-5 py-3 text-sm font-medium text-black transition hover:border-black/30 hover:bg-white/70"
                >
                  See the metric layer
                </Link>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {metrics.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-[22px] border border-black/8 bg-white/80 p-5 shadow-[0_8px_30px_rgba(0,0,0,0.06)] backdrop-blur"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-black/45">
                      {item.label}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-black/75">{item.value}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-[32px] border border-black/10 bg-white p-5 shadow-[0_24px_80px_rgba(0,0,0,0.12)]">
                <div className="flex items-center justify-between rounded-[24px] bg-black px-5 py-4 text-white">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-white/55">
                      Today&apos;s metric trust view
                    </p>
                    <p className="mt-1 text-lg font-semibold">One value, with sources attached</p>
                  </div>
                  <ShieldCheck className="h-5 w-5 text-[#fc5a29]" aria-hidden="true" />
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-[1.1fr_0.9fr]">
                  <div className="rounded-[24px] bg-[#f5f5f5] p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold">Source health</p>
                      <span className="rounded-full bg-[#fc5a29]/10 px-3 py-1 text-xs font-medium text-[#fc5a29]">
                        Trust labeled
                      </span>
                    </div>
                    <div className="mt-4 space-y-3">
                      {[
                        { lane: "Fresh", count: "18", fill: "bg-[#1d1d1d]", width: "w-[78%]" },
                        { lane: "Partial", count: "03", fill: "bg-[#fc5a29]", width: "w-[54%]" },
                        { lane: "Missing", count: "02", fill: "bg-[#f2b3a0]", width: "w-[36%]" },
                      ].map((lane) => (
                        <div key={lane.lane} className="rounded-2xl bg-white p-3">
                          <div className="flex items-center justify-between text-sm">
                            <span className="font-medium">{lane.lane}</span>
                            <span className="text-black/55">{lane.count} metrics</span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-black/8">
                            <div className={`h-2 rounded-full ${lane.fill} ${lane.width}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="rounded-[24px] bg-[#f7dfd7] p-4">
                      <div className="flex items-center gap-3">
                        <CalendarRange className="h-5 w-5 text-[#fc5a29]" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">Upcoming customer load</p>
                          <p className="text-sm text-black/65">
                            Demo, pipeline, and retention signals share one customer timeline.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-[#f5f5f5] p-4">
                      <div className="flex items-center gap-3">
                        <Target className="h-5 w-5 text-[#080808]" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">Lifecycle context</p>
                          <p className="text-sm text-black/65">
                            Traffic, demos, pipeline, and CS signals read from the same account path.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-[24px] bg-black p-4 text-white">
                      <div className="flex items-center gap-3">
                        <Sparkles className="h-5 w-5 text-[#fc5a29]" aria-hidden="true" />
                        <div>
                          <p className="text-sm font-semibold">Record-keeping on movement</p>
                          <p className="text-sm text-white/65">
                            Report exports cite the same locked facts that power the command center.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-white/70 py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/45">
                Why executive reporting gets distorted
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                The meeting breaks the moment each team owns a different truth.
              </h2>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {painPoints.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-black/8 bg-white p-6 shadow-[0_8px_30px_rgba(0,0,0,0.05)]"
                >
                  <item.icon className="h-5 w-5 text-[#fc5a29]" aria-hidden="true" />
                  <h3 className="mt-4 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-black/65">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/45">
                  Operating model
                </p>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                  Fix the journey by fixing the sequence.
                </h2>
              </div>
              <p className="max-w-xl text-sm leading-6 text-black/65">
                Source snapshots enter once, canonical calculators create the metric,
                and every dashboard or export reuses that value with the same trust
                state and citations.
              </p>
            </div>

            <div className="mt-10 grid gap-4 lg:grid-cols-4">
              {operatingModel.map((item) => (
                <div key={item.step} className="rounded-[28px] bg-black p-6 text-white">
                  <p className="text-xs font-semibold tracking-[0.22em] text-white/45">
                    {item.step}
                  </p>
                  <h3 className="mt-5 text-xl font-semibold">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-white/68">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#d7d7d7] py-16">
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-black/45">
                Built for the operating meeting loop
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                One metric surface for the people accountable for the business.
              </h2>
            </div>
            <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {roleCards.map((item) => (
                <div key={item.title} className="rounded-[24px] bg-white p-6">
                  <p className="text-lg font-semibold">{item.title}</p>
                  <p className="mt-3 text-sm leading-6 text-black/65">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-black py-16 text-white">
          <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div className="max-w-2xl">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/45">
                Access
              </p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
                WIPGuard is invite-only right now.
              </h2>
              <p className="mt-4 text-sm leading-7 text-white/65 sm:text-base">
                Existing team members and beta operators can sign in to their
                workspace. Everyone else should start by understanding the
                metric trust model, not by getting dropped into an internal source map.
              </p>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fc5a29] px-5 py-3 text-sm font-medium text-white transition hover:bg-[#e64b1c]"
            >
              Sign in to WIPGuard
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
