import { IntegrationProvider } from "@/generated/prisma/client";
import type { PrismaClientType } from "@/lib/prisma";

export type ActivationJourneyMilestoneKey =
  // ── Marketing website funnel (www.arda.cards) — terminates at `paid` ──
  | "site_visited"
  | "kanban_submitted"
  | "cta_clicked"
  | "demo"
  | "trial"
  | "paid"
  // ── Activation funnel (live.app.arda.cards) — begins at `signup` ──────
  | "signup"
  | "tour_started"
  | "video_completed"
  | "item_created"
  | "card_printed"
  | "queue_added"
  | "order_placed"
  | "activation_completed";

/**
 * Which of the two funnels a milestone belongs to. The marketing (commercial)
 * funnel and the activation (product-usage) funnel are independent: each computes
 * its own conversions, and `signup` — the first activation milestone — can follow
 * `trial` OR `paid`, or be a direct/free signup. See `ActivationJourneyBridge`.
 */
export type ActivationFunnelKey = "marketing" | "activation";

export type AcquisitionSourceKey =
  | "direct"
  | "google_organic"
  | "google_ads"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "referral"
  | "email";

export type ActorCohortKey = "tour_completed" | "started_not_completed" | "no_tour";

/**
 * Sub-stage "kinds" describe the supporting signal a sub-stage tracks. Sub-stages
 * are diagnostic detail layered *under* a milestone (page views, drop-off,
 * frustration, supporting conversions, etc.) and give the previously-unmapped
 * PostHog events a home. They do NOT advance the milestone funnel — only a
 * milestone's primary events do that.
 */
export type ActivationJourneySubStageKind =
  | "pageview"
  | "pageleave"
  | "sign_up"
  | "sign_in"
  | "sign_out"
  | "password_reset"
  | "file_upload"
  | "rage_click"
  | "dead_click"
  | "interaction"
  | "web_vitals"
  | "exception"
  | "video"
  | "fulfillment"
  | "invite";

type SourceStatus = "ready" | "partial" | "missing";
type ObservationSeverity = "info" | "warning" | "critical";

export interface ActivationJourneySummary {
  totalEvents: number;
  identifiedActors: number;
  activatedActors: number;
  activationRate: number | null;
  medianHoursToActivation: number | null;
  lastEventAt: string | null;
}

export interface ActivationJourneySubStage {
  key: string;
  label: string;
  kind: ActivationJourneySubStageKind;
  description: string;
  /** PostHog event name(s) this sub-stage listens for. */
  events: string[];
  /** "instrumented" once events were observed in the window; "missing" otherwise (e.g. not yet captured). */
  status: "instrumented" | "missing";
  eventCount: number;
  actors: number;
}

export interface ActivationJourneyMilestone {
  key: ActivationJourneyMilestoneKey;
  funnel: ActivationFunnelKey;
  label: string;
  description: string;
  status: "instrumented" | "missing";
  actors: number;
  events: number;
  /** Conversion from the PREVIOUS milestone WITHIN THE SAME FUNNEL. Null for the first milestone of each funnel — never computed across the marketing→activation boundary. */
  conversionFromPrevious: number | null;
  dropoffFromPrevious: number | null;
  medianHoursFromFirstEvent: number | null;
  subStages: ActivationJourneySubStage[];
}

/**
 * The non-linear join between the marketing (commercial) funnel and the
 * activation funnel. `signup` has no single upstream parent — it can follow
 * `trial` OR `paid`, or be a direct/free signup — so this is modeled as a
 * set-union bridge, NOT a funnel step.
 */
export interface ActivationJourneyBridge {
  /** Actors who reached trial OR paid (the commercial-outcome set, the union denominator). */
  commercialActors: number;
  /** Of the commercial set, how many also signed up (entered the activation funnel). */
  signedUpActors: number;
  /** signedUpActors / commercialActors. */
  conversionRate: number | null;
  /** Every signup attributed to its inbound path by timestamp; buckets sum to `total`. */
  signupAttribution: {
    /** Signed up after becoming paid. */
    postPaid: number;
    /** Signed up after a trial (and not paid-first). */
    postTrial: number;
    /** Signed up with no preceding trial/paid — free/direct. */
    direct: number;
    /** All signups (== activation funnel entrants). */
    total: number;
  };
}

export interface ActivationJourneyCohort {
  key: string;
  label: string;
  actors: number;
  activatedActors: number;
  activationRate: number | null;
}

export interface ActivationJourneyPath {
  sequence: ActivationJourneyMilestoneKey[];
  actors: number;
  activatedActors: number;
  activationRate: number | null;
}

export interface ActivationJourneyEventTaxonomyRow {
  event: string;
  mappedMilestone: ActivationJourneyMilestoneKey | null;
  /** Sub-stage keys this event feeds. One event name (e.g. $pageview) can feed several, by page. */
  mappedSubStages: string[];
  count: number;
  actors: number;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
}

export interface ActivationJourneyObservation {
  title: string;
  detail: string;
  severity: ObservationSeverity;
}

export interface FrictionSummary {
  milestoneKey: ActivationJourneyMilestoneKey;
  label: string;
  rageClicks: number;
  deadClicks: number;
  totalFriction: number;
}

export interface SequentialFunnelEntry {
  milestoneKey: ActivationJourneyMilestoneKey;
  label: string;
  /** Actors who reached this milestone AND all prior milestones. */
  sequentialActors: number;
  /** Actors who reached this milestone in any order. */
  anyOrderActors: number;
  /** sequentialActors / total identified actors. */
  sequentialRate: number | null;
}

export interface TransitionTime {
  from: ActivationJourneyMilestoneKey;
  to: ActivationJourneyMilestoneKey;
  fromLabel: string;
  toLabel: string;
  medianHours: number | null;
  /** Actors who completed both milestones. */
  actors: number;
}

export interface ActorSample {
  actorId: string;
  source: AcquisitionSourceKey;
  milestones: ActivationJourneyMilestoneKey[];
  furthestMilestone: ActivationJourneyMilestoneKey | null;
  cohort: ActorCohortKey;
  sessionReplayUrl: string | null;
  identityUrl: string | null;
  analyticsUrl: string | null;
}

/**
 * Compact per-actor journey summary sent to the client so it can build
 * Sankey links and segment funnels for any segmentation mode without
 * re-fetching.
 */
export interface ActorJourneySummary {
  source: AcquisitionSourceKey;
  milestones: ActivationJourneyMilestoneKey[];
  furthest: ActivationJourneyMilestoneKey | null;
  cohort: ActorCohortKey;
}

export interface ActivationJourneyDashboardPayload {
  summary: ActivationJourneySummary;
  /** All milestones, both funnels, in canonical order. Each carries `funnel`. */
  milestones: ActivationJourneyMilestone[];
  /** Marketing website funnel (www.arda.cards): site_visited → … → demo → trial → paid. */
  marketingFunnel: ActivationJourneyMilestone[];
  /** Activation funnel (live.app.arda.cards): signup → tour_started → … → activation_completed. */
  activationFunnel: ActivationJourneyMilestone[];
  /** Non-linear trial∪paid → signup join between the two funnels. */
  bridge: ActivationJourneyBridge;
  cohorts: ActivationJourneyCohort[];
  paths: ActivationJourneyPath[];
  eventTaxonomy: ActivationJourneyEventTaxonomyRow[];
  observations: ActivationJourneyObservation[];
  source: {
    status: SourceStatus;
    unmappedEvents: number;
    subStageMappedEvents: number;
    /** PostHog system/plumbing events ($identify, $set, $session_summary_ready) intentionally excluded from journey attribution. */
    systemEvents: number;
  };
  window: {
    from: string;
    to: string;
    days: number;
  };
  /** Per-milestone friction roll-up (rage + dead clicks). */
  friction: FrictionSummary[];
  /** Strict-order sequential funnel counts. */
  sequentialFunnel: SequentialFunnelEntry[];
  /** Median hours between consecutive milestone pairs. */
  transitionTimes: TransitionTime[];
  /** Stratified sample of ~12 actor journeys for drill-down. */
  actorSamples: ActorSample[];
  /** Compact per-actor summaries for client-side Sankey + segment computation. */
  actorJourneys: ActorJourneySummary[];
}

export interface BuildActivationJourneyDashboardInput {
  prisma: Pick<PrismaClientType, "imladrisRawSourceRecord">;
  context: {
    userId?: string | null;
    organizationId?: string | null;
  };
  now?: Date;
  days?: number;
  /** Explicit window start (takes precedence over `days`). */
  from?: Date | null;
  /** Explicit window end (defaults to `now`). */
  to?: Date | null;
  /** Include all available history — ignores `days`/`from`. window.from reports the earliest event. */
  all?: boolean;
}

interface NormalizedPostHogEvent {
  actorId: string;
  event: string;
  occurredAt: Date;
  properties: Record<string, unknown>;
  sessionId: string | null;
}

interface ActorJourney {
  actorId: string;
  firstEventAt: Date;
  sessionId: string | null;
  milestones: Map<ActivationJourneyMilestoneKey, Date>;
  source: AcquisitionSourceKey;
}

/**
 * Real Arda product page paths (taken from live PostHog `$pathname` values),
 * grouped by the activation stage they belong to. Used to scope page-level
 * sub-stages ($pageview / $pageleave / $rageclick / $dead_click) to the right
 * milestone. Paths are compared after `normalizePath`, so trailing slashes and
 * query strings are ignored.
 */
const AUTH_AND_LANDING_PATHS = ["/", "/signup", "/signin", "/reset-password"];
const ONBOARDING_PATHS = ["/create-free-kanban-cards"];
const ITEMS_PATHS = ["/items"];
const PRINT_PATHS = ["/print-viewer"];
const ORDER_QUEUE_PATHS = ["/order-queue"];
const RECEIVING_PATHS = ["/receiving"];

// ── Marketing site (Webflow @ www.arda.cards) ──────────────────────────
const MARKETING_HOST = "www.arda.cards";
const MARKETING_HOMEPAGE_PATHS = ["/"];
const MARKETING_PRICING_PATHS = ["/pricing"];
const MARKETING_FEATURES_PATHS = ["/features"];
const MARKETING_SCHEDULE_PATHS = ["/schedule-a-call"];
const MARKETING_BOOKING_PATHS = ["/booking-confirmation"];
const MARKETING_COMPARE_PATHS = ["/compare"];

interface SubStageDefinition {
  key: string;
  label: string;
  kind: ActivationJourneySubStageKind;
  description: string;
  events: string[];
  include?: (event: NormalizedPostHogEvent) => boolean;
}

/**
 * PostHog system / plumbing events that are deliberately NOT attributed to a
 * customer-journey stage — they describe identity resolution or SDK internals,
 * not product behavior. Counted separately (source.systemEvents) so they don't
 * inflate the genuinely-unmapped tally.
 */
const SYSTEM_EVENTS = new Set(["$identify", "$set", "$session_summary_ready"]);

/**
 * Standard page-scoped "secondary signal" sub-stages shared across stages:
 * engagement ($autocapture), experience ($web_vitals), and friction
 * ($rageclick / $dead_click / $exception / $pageleave). Generated per stage so
 * the same diagnostic lenses apply to every page group without hand-repeating
 * each definition. Only pass the kinds a stage doesn't already define by hand,
 * so no event is double-counted. All are scoped to `paths`, keeping page-level
 * events disjoint across stages.
 */
type SecondarySignalKind =
  | "interaction"
  | "web_vitals"
  | "rage_click"
  | "dead_click"
  | "exception"
  | "pageleave";

function secondarySignalSubStages(
  prefix: string,
  pageLabel: string,
  paths: string[],
  kinds: SecondarySignalKind[],
): SubStageDefinition[] {
  const matcher = pathMatcher(paths);
  const blueprints: Record<
    SecondarySignalKind,
    { keySuffix: string; label: string; kind: ActivationJourneySubStageKind; events: string[]; description: string }
  > = {
    interaction: {
      keySuffix: "interactions",
      label: `${pageLabel} interactions`,
      kind: "interaction",
      events: ["$autocapture"],
      description: `$autocapture clicks/inputs on ${pageLabel} pages — engagement depth at this stage.`,
    },
    web_vitals: {
      keySuffix: "web_vitals",
      label: `${pageLabel} web vitals`,
      kind: "web_vitals",
      events: ["$web_vitals"],
      description: `$web_vitals performance samples on ${pageLabel} pages — load/interaction experience.`,
    },
    rage_click: {
      keySuffix: "rageclick",
      label: `${pageLabel} rage clicks`,
      kind: "rage_click",
      events: ["$rageclick"],
      description: `$rageclick on ${pageLabel} pages — frustration.`,
    },
    dead_click: {
      keySuffix: "deadclick",
      label: `${pageLabel} dead clicks`,
      kind: "dead_click",
      events: ["$dead_click"],
      description: `$dead_click on ${pageLabel} pages — clicks on things that look interactive but aren't.`,
    },
    exception: {
      keySuffix: "exceptions",
      label: `${pageLabel} exceptions`,
      kind: "exception",
      events: ["$exception"],
      description: `$exception on ${pageLabel} pages — client errors that can block progress.`,
    },
    pageleave: {
      keySuffix: "pageleave",
      label: `${pageLabel} drop-off (pageleave)`,
      kind: "pageleave",
      events: ["$pageleave"],
      description: `$pageleave on ${pageLabel} pages — where people fall off.`,
    },
  };

  return kinds.map((signalKind) => {
    const blueprint = blueprints[signalKind];
    return {
      key: `${prefix}_${blueprint.keySuffix}`,
      label: blueprint.label,
      kind: blueprint.kind,
      description: blueprint.description,
      events: blueprint.events,
      include: matcher,
    };
  });
}

const milestoneDefinitions: Array<{
  key: ActivationJourneyMilestoneKey;
  funnel: ActivationFunnelKey;
  label: string;
  description: string;
  events: string[];
  include?: (event: NormalizedPostHogEvent) => boolean;
  subStages: SubStageDefinition[];
}> = [
  // ── Marketing website funnel (www.arda.cards) — ends at `paid` ────────
  {
    key: "site_visited",
    funnel: "marketing",
    label: "Site visited",
    description: "First visit to arda.cards marketing site (custom event from Webflow tracking code).",
    events: ["marketing_site_visited"],
    subStages: [
      {
        key: "mkt_homepage",
        label: "Homepage views",
        kind: "pageview",
        description: "$pageview on marketing homepage (www.arda.cards/).",
        events: ["$pageview"],
        include: hostAndPathMatcher(MARKETING_HOST, MARKETING_HOMEPAGE_PATHS),
      },
      {
        key: "mkt_pricing",
        label: "Pricing page views",
        kind: "pageview",
        description: "$pageview on marketing pricing page.",
        events: ["$pageview"],
        include: hostAndPathMatcher(MARKETING_HOST, MARKETING_PRICING_PATHS),
      },
      {
        key: "mkt_features",
        label: "Features page views",
        kind: "pageview",
        description: "$pageview on marketing features page.",
        events: ["$pageview"],
        include: hostAndPathMatcher(MARKETING_HOST, MARKETING_FEATURES_PATHS),
      },
      {
        key: "mkt_blog",
        label: "Blog & content views",
        kind: "pageview",
        description: "$pageview on blog listing or individual posts.",
        events: ["$pageview"],
        include: hostAndPathPrefixMatcher(MARKETING_HOST, ["/blog"], ["/post/"]),
      },
      {
        key: "mkt_case_studies",
        label: "Case study views",
        kind: "pageview",
        description: "$pageview on case studies listing or individual case studies.",
        events: ["$pageview"],
        include: hostAndPathPrefixMatcher(MARKETING_HOST, ["/case-studies"], ["/case-study/"]),
      },
      {
        key: "mkt_compare",
        label: "Comparison page views",
        kind: "pageview",
        description: "$pageview on comparison/alternatives pages.",
        events: ["$pageview"],
        include: hostAndPathPrefixMatcher(MARKETING_HOST, MARKETING_COMPARE_PATHS, ["/compare/"]),
      },
      {
        key: "mkt_interactions",
        label: "Marketing site interactions",
        kind: "interaction",
        description: "$autocapture clicks/inputs on marketing site — engagement depth.",
        events: ["$autocapture"],
        include: hostMatcher(MARKETING_HOST),
      },
      {
        key: "mkt_rageclick",
        label: "Marketing site rage clicks",
        kind: "rage_click",
        description: "$rageclick on marketing site — frustration.",
        events: ["$rageclick"],
        include: hostMatcher(MARKETING_HOST),
      },
      {
        key: "mkt_deadclick",
        label: "Marketing site dead clicks",
        kind: "dead_click",
        description: "$dead_click on marketing site — clicks on non-interactive elements.",
        events: ["$dead_click"],
        include: hostMatcher(MARKETING_HOST),
      },
    ],
  },
  {
    key: "kanban_submitted",
    funnel: "marketing",
    label: "Free kanban submitted",
    description: "Visitor submitted the free kanban card form on /create-free-kanban-cards.",
    events: ["$autocapture"],
    include: (() => {
      const isKanbanPath = pathMatcher(ONBOARDING_PATHS);
      return (event: NormalizedPostHogEvent) =>
        asString(event.properties["$event_type"]) === "submit" && isKanbanPath(event);
    })(),
    subStages: [
      {
        key: "kanban_pageview",
        label: "Kanban page views",
        kind: "pageview",
        description: "$pageview on /create-free-kanban-cards — visitors who land on the free kanban tool.",
        events: ["$pageview"],
        include: pathMatcher(ONBOARDING_PATHS),
      },
      ...secondarySignalSubStages(
        "kanban",
        "Free kanban",
        ONBOARDING_PATHS,
        ["interaction", "web_vitals", "rage_click", "dead_click", "exception", "pageleave"],
      ),
    ],
  },
  {
    key: "cta_clicked",
    funnel: "marketing",
    label: "CTA clicked",
    description: "Clicked a primary CTA on arda.cards (trial, demo, free cards, or action demo).",
    events: ["marketing_cta_clicked"],
    subStages: [
      {
        key: "mkt_schedule_pageview",
        label: "Schedule-a-call page views",
        kind: "pageview",
        description: "$pageview on /schedule-a-call — intent to book a demo.",
        events: ["$pageview"],
        include: hostAndPathMatcher(MARKETING_HOST, MARKETING_SCHEDULE_PATHS),
      },
      {
        key: "mkt_pageleave",
        label: "Marketing site drop-off",
        kind: "pageleave",
        description: "$pageleave on marketing site — where visitors fall off.",
        events: ["$pageleave"],
        include: hostMatcher(MARKETING_HOST),
      },
    ],
  },
  {
    key: "demo",
    funnel: "marketing",
    label: "Demo booked",
    description: "Booked a demo on arda.cards (reached /booking-confirmation). Default: demo = booked; switch to demo-attended would require a calendar/HubSpot signal.",
    events: ["marketing_demo_requested"],
    subStages: [
      {
        key: "mkt_booking_confirmation",
        label: "Booking confirmation views",
        kind: "pageview",
        description: "$pageview on /booking-confirmation — demo successfully booked.",
        events: ["$pageview"],
        include: hostAndPathMatcher(MARKETING_HOST, MARKETING_BOOKING_PATHS),
      },
    ],
  },
  {
    key: "trial",
    funnel: "marketing",
    label: "Trial started",
    description:
      "Started a product trial. Awaiting the `trial_started` PostHog event from the Arda product app (see PDEV instrumentation ticket); renders as 'missing' until emitted.",
    events: ["trial_started"],
    subStages: [],
  },
  {
    key: "paid",
    funnel: "marketing",
    label: "Became paid",
    description:
      "Converted to a paying customer — the TERMINAL stage of the marketing funnel. Awaiting `subscription_paid` / `checkout_completed` from the product app; renders as 'missing' until emitted.",
    events: ["subscription_paid", "checkout_completed"],
    subStages: [],
  },
  // ── Activation funnel (live.app.arda.cards) — begins at `signup` ──────
  {
    key: "signup",
    funnel: "activation",
    label: "Signed up",
    description:
      "user_signed_up — a new account is created in live.app.arda.cards. First step of the activation funnel; can follow trial or paid, or be a direct/free signup (see bridge).",
    events: ["user_signed_up"],
    subStages: [
      {
        key: "auth_landing_pageview",
        label: "Auth & landing pageviews",
        kind: "pageview",
        description: "$pageview on landing, sign-up, sign-in, and reset-password pages.",
        events: ["$pageview"],
        include: pathMatcher(AUTH_AND_LANDING_PATHS),
      },
      {
        key: "sign_in",
        label: "Sign-ins",
        kind: "sign_in",
        description: "user_signed_in — a returning user authenticates.",
        events: ["user_signed_in"],
      },
      {
        key: "password_reset_requested",
        label: "Password resets requested",
        kind: "password_reset",
        description: "password_reset_requested — friction signal during the auth step.",
        events: ["password_reset_requested"],
      },
      {
        key: "onboarding_rageclick",
        label: "Auth rage clicks",
        kind: "rage_click",
        description: "$rageclick on auth pages — early frustration.",
        events: ["$rageclick"],
        include: pathMatcher(AUTH_AND_LANDING_PATHS),
      },
      {
        key: "onboarding_pageleave",
        label: "Auth drop-off (pageleave)",
        kind: "pageleave",
        description: "$pageleave on auth pages — where people fall off before starting.",
        events: ["$pageleave"],
        include: pathMatcher(AUTH_AND_LANDING_PATHS),
      },
      {
        key: "sign_out",
        label: "Sign-outs",
        kind: "sign_out",
        description: "user_signed_out — a session ends; auth-lifecycle signal (can occur from any page).",
        events: ["user_signed_out"],
      },
      ...secondarySignalSubStages(
        "signup",
        "Auth",
        AUTH_AND_LANDING_PATHS,
        ["interaction", "web_vitals", "dead_click", "exception"],
      ),
    ],
  },
  {
    key: "tour_started",
    funnel: "activation",
    label: "Tour started",
    description: "PR #915 onboarding tour starts for a newly signed-in user.",
    events: ["onboarding_tour_started"],
    subStages: [],
  },
  {
    key: "video_completed",
    funnel: "activation",
    label: "Video completed",
    description: "Welcome video completes with placement=onboarding-tour.",
    events: ["walkthrough_video_completed"],
    include: (event) => event.properties.placement === "onboarding-tour",
    subStages: [
      {
        key: "video_shown",
        label: "Walkthrough video shown",
        kind: "video",
        description: "walkthrough_video_shown — the welcome video was surfaced (denominator for completion).",
        events: ["walkthrough_video_shown"],
      },
    ],
  },
  {
    key: "item_created",
    funnel: "activation",
    label: "Item created",
    description: "PR #909 item_created fires server-side after manual item creation succeeds.",
    events: ["item_created"],
    subStages: [
      {
        key: "items_pageview",
        label: "Items pageviews",
        kind: "pageview",
        description: "$pageview on /items.",
        events: ["$pageview"],
        include: pathMatcher(ITEMS_PATHS),
      },
      {
        key: "item_file_uploaded",
        label: "Item file uploads",
        kind: "file_upload",
        description: "item_file_uploaded — a file is uploaded while creating an item.",
        events: ["item_file_uploaded"],
      },
      {
        key: "items_rageclick",
        label: "Items rage clicks",
        kind: "rage_click",
        description: "$rageclick on /items — friction during item creation.",
        events: ["$rageclick"],
        include: pathMatcher(ITEMS_PATHS),
      },
      {
        key: "items_pageleave",
        label: "Items drop-off (pageleave)",
        kind: "pageleave",
        description: "$pageleave on /items — where people abandon item creation.",
        events: ["$pageleave"],
        include: pathMatcher(ITEMS_PATHS),
      },
      ...secondarySignalSubStages("items", "Items", ITEMS_PATHS, [
        "interaction",
        "web_vitals",
        "dead_click",
        "exception",
      ]),
    ],
  },
  {
    key: "card_printed",
    funnel: "activation",
    label: "Card printed",
    description: "PR #909 card_printed fires for Kanban card and item-label print success.",
    events: ["card_printed"],
    subStages: [
      {
        key: "print_pageview",
        label: "Print viewer pageviews",
        kind: "pageview",
        description: "$pageview on /print-viewer.",
        events: ["$pageview"],
        include: pathMatcher(PRINT_PATHS),
      },
      {
        key: "print_rageclick",
        label: "Print viewer rage clicks",
        kind: "rage_click",
        description: "$rageclick on /print-viewer — a frequently fiddly step.",
        events: ["$rageclick"],
        include: pathMatcher(PRINT_PATHS),
      },
      {
        key: "print_deadclick",
        label: "Print viewer dead clicks",
        kind: "dead_click",
        description: "$dead_click on /print-viewer — clicks on things that look interactive but aren't.",
        events: ["$dead_click"],
        include: pathMatcher(PRINT_PATHS),
      },
      {
        key: "print_pageleave",
        label: "Print viewer drop-off (pageleave)",
        kind: "pageleave",
        description: "$pageleave on /print-viewer — where people abandon printing.",
        events: ["$pageleave"],
        include: pathMatcher(PRINT_PATHS),
      },
      ...secondarySignalSubStages("print", "Print viewer", PRINT_PATHS, [
        "interaction",
        "web_vitals",
        "exception",
      ]),
    ],
  },
  {
    key: "queue_added",
    funnel: "activation",
    label: "Added to order queue",
    description: "Bridge event from the first item to the order queue.",
    events: ["card_added_to_order_queue"],
    subStages: [
      {
        key: "order_queue_pageview",
        label: "Order queue pageviews",
        kind: "pageview",
        description: "$pageview on /order-queue.",
        events: ["$pageview"],
        include: pathMatcher(ORDER_QUEUE_PATHS),
      },
      {
        key: "order_queue_rageclick",
        label: "Order queue rage clicks",
        kind: "rage_click",
        description: "$rageclick on /order-queue — friction assembling an order.",
        events: ["$rageclick"],
        include: pathMatcher(ORDER_QUEUE_PATHS),
      },
      {
        key: "order_queue_pageleave",
        label: "Order queue drop-off (pageleave)",
        kind: "pageleave",
        description: "$pageleave on /order-queue — where people abandon the queue.",
        events: ["$pageleave"],
        include: pathMatcher(ORDER_QUEUE_PATHS),
      },
      ...secondarySignalSubStages("order_queue", "Order queue", ORDER_QUEUE_PATHS, [
        "interaction",
        "web_vitals",
        "dead_click",
        "exception",
      ]),
    ],
  },
  {
    key: "order_placed",
    funnel: "activation",
    label: "Order placed",
    description: "PR #909 order_placed maps to card accept or fulfillment from the order queue.",
    events: ["order_placed", "card_fulfilled"],
    subStages: [],
  },
  {
    key: "activation_completed",
    funnel: "activation",
    label: "Activation completed",
    description: "Terminal marker for users who complete the activation loop (order fully fulfilled / received).",
    events: ["activation_completed", "all_cards_fulfilled", "cards_received"],
    subStages: [
      {
        key: "receiving_pageview",
        label: "Receiving pageviews",
        kind: "pageview",
        description: "$pageview on /receiving — the user returns to receive their cards.",
        events: ["$pageview"],
        include: pathMatcher(RECEIVING_PATHS),
      },
      {
        key: "invitation_accepted",
        label: "Invitations accepted",
        kind: "invite",
        description: "invitation_accepted — a teammate accepts an invite, expanding the activated account.",
        events: ["invitation_accepted"],
      },
      ...secondarySignalSubStages("receiving", "Receiving", RECEIVING_PATHS, [
        "interaction",
        "web_vitals",
        "rage_click",
        "dead_click",
        "exception",
        "pageleave",
      ]),
    ],
  },
];

/** Flat index of every sub-stage with its parent milestone, for event resolution. */
const subStageIndex: Array<{ milestoneKey: ActivationJourneyMilestoneKey; definition: SubStageDefinition }> =
  milestoneDefinitions.flatMap((milestone) =>
    milestone.subStages.map((definition) => ({ milestoneKey: milestone.key, definition })),
  );

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function toDate(value: unknown, fallback: unknown): Date | null {
  const source =
    asString(value) ?? (fallback instanceof Date ? fallback.toISOString() : asString(fallback));
  if (!source) return null;

  const parsed = new Date(source);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function percent(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 10_000) / 100;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const raw =
    sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return Math.round(raw * 100) / 100;
}

function normalizeRawPostHogEvent(row: unknown): NormalizedPostHogEvent | null {
  const raw = asRecord(row);
  const payload = asRecord(raw.payload);
  const actorId = asString(payload.distinct_id) ?? asString(payload.distinctId);
  const event = asString(payload.event);
  const occurredAt = toDate(payload.timestamp, raw.occurredAt);
  const properties = asRecord(payload.properties);

  if (!actorId || !event || !occurredAt) return null;

  return {
    actorId,
    event,
    occurredAt,
    properties,
    sessionId:
      asString(properties["$session_id"]) ??
      asString(properties.session_id) ??
      asString(payload["$session_id"]),
  };
}

function normalizePostHogAppHost(host: string | null | undefined): string {
  const raw = host?.trim().replace(/\/+$/, "");
  if (!raw) return "https://app.posthog.com";

  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const hostname =
      url.hostname === "us.i.posthog.com"
        ? "us.posthog.com"
        : url.hostname === "eu.i.posthog.com"
          ? "eu.posthog.com"
          : url.hostname;
    return `${url.protocol}//${hostname}`;
  } catch {
    return "https://app.posthog.com";
  }
}

function postHogProjectId(): string | null {
  return asString(process.env.POSTHOG_PROJECT_ID);
}

function postHogAppHost(): string {
  return normalizePostHogAppHost(
    process.env.POSTHOG_APP_HOST ?? process.env.POSTHOG_HOST ?? process.env.POSTHOG_API_HOST,
  );
}

function postHogActorLinks(actor: ActorJourney): Pick<
  ActorSample,
  "sessionReplayUrl" | "identityUrl" | "analyticsUrl"
> {
  const projectId = postHogProjectId();
  if (!projectId) {
    return { sessionReplayUrl: null, identityUrl: null, analyticsUrl: null };
  }

  const baseUrl = `${postHogAppHost()}/project/${encodeURIComponent(projectId)}`;
  const actorId = encodeURIComponent(actor.actorId);
  const sessionId = actor.sessionId ? encodeURIComponent(actor.sessionId) : null;

  return {
    sessionReplayUrl: sessionId ? `${baseUrl}/replay/${sessionId}` : null,
    identityUrl: `${baseUrl}/person/${actorId}`,
    analyticsUrl: `${baseUrl}/events?distinct_id=${actorId}`,
  };
}

function milestoneForEvent(
  event: NormalizedPostHogEvent,
): ActivationJourneyMilestoneKey | null {
  return (
    milestoneDefinitions.find(
      (definition) =>
        definition.events.includes(event.event) &&
        (!definition.include || definition.include(event)),
    )?.key ?? null
  );
}

function normalizePath(value: string): string {
  if (!value) return "";
  const withoutQuery = value.split(/[?#]/)[0];
  if (withoutQuery.length > 1) {
    return withoutQuery.replace(/\/+$/, "");
  }
  return withoutQuery;
}

function eventPath(event: NormalizedPostHogEvent): string {
  const direct = asString(event.properties["$pathname"]);
  if (direct) return normalizePath(direct);

  const url = asString(event.properties["$current_url"]);
  if (url) {
    try {
      return normalizePath(new URL(url).pathname);
    } catch {
      return "";
    }
  }
  return "";
}

function pathMatcher(paths: string[]): (event: NormalizedPostHogEvent) => boolean {
  const normalized = paths.map(normalizePath);
  return (event) => {
    const path = eventPath(event);
    return path !== "" && normalized.includes(path);
  };
}

/** Extract host from event, falling back to $current_url when $host is absent. */
function eventHostname(event: NormalizedPostHogEvent): string {
  const explicit = asString(event.properties.$host);
  if (explicit) return explicit.toLowerCase();
  const url = asString(event.properties.$current_url);
  if (url) {
    try { return new URL(url).hostname.toLowerCase(); } catch { /* malformed */ }
  }
  return "";
}

/** Match events from a specific host AND specific paths. */
function hostAndPathMatcher(
  host: string,
  paths: string[],
): (event: NormalizedPostHogEvent) => boolean {
  const normalizedPaths = paths.map(normalizePath);
  const lowerHost = host.toLowerCase();
  return (event) => {
    if (eventHostname(event) !== lowerHost) return false;
    const path = eventPath(event);
    return path !== "" && normalizedPaths.includes(path);
  };
}

/**
 * Match events from a specific host with exact paths OR path prefixes.
 * Useful for blog posts (/post/*) and case studies (/case-study/*).
 */
function hostAndPathPrefixMatcher(
  host: string,
  exactPaths: string[],
  prefixes: string[],
): (event: NormalizedPostHogEvent) => boolean {
  const normalizedExact = exactPaths.map(normalizePath);
  const lowerHost = host.toLowerCase();
  // Keep trailing slash on prefixes so "/post/" doesn't match "/postmortem"
  const normalizedPrefixes = prefixes.map((p) => p.toLowerCase());
  return (event) => {
    if (eventHostname(event) !== lowerHost) return false;
    const path = eventPath(event);
    if (path === "") return false;
    if (normalizedExact.includes(path)) return true;
    return normalizedPrefixes.some((prefix) => path.startsWith(prefix));
  };
}

/** Match any event from a specific host. */
function hostMatcher(host: string): (event: NormalizedPostHogEvent) => boolean {
  const lowerHost = host.toLowerCase();
  return (event) => eventHostname(event) === lowerHost;
}

/**
 * Classify an actor's acquisition source from PostHog event properties.
 * Checks both `$initial_utm_*` (person-on-events first-touch properties) and
 * `utm_*` (current-pageview URL params, used by the Webflow marketing site).
 * Falls back to `$initial_referring_domain` / `$referring_domain`.
 */
function classifySource(properties: Record<string, unknown>): AcquisitionSourceKey {
  const utmSource = (
    asString(properties.$initial_utm_source) ??
    asString(properties.utm_source) ??
    ""
  ).toLowerCase();
  const utmMedium = (
    asString(properties.$initial_utm_medium) ??
    asString(properties.utm_medium) ??
    ""
  ).toLowerCase();
  const referrer = (
    asString(properties.$initial_referring_domain) ??
    asString(properties.$referring_domain) ??
    ""
  ).toLowerCase();

  // Google Ads — paid search (most specific, check first)
  if (
    (utmSource === "google" && (utmMedium === "cpc" || utmMedium === "ppc")) ||
    (utmSource === "adwords" && utmMedium === "ppc") ||
    asString(properties.$initial_gclid) !== null ||
    asString(properties.gclid) !== null ||
    referrer.includes("googleads.g.doubleclick.net")
  ) {
    return "google_ads";
  }
  // Instagram — check before Facebook so paid_social doesn't swallow IG campaigns
  if (
    utmSource === "instagram" || utmSource === "ig" ||
    referrer.includes("instagram.com")
  ) {
    return "instagram";
  }
  // Facebook — paid or organic (paid_social only after IG is ruled out)
  if (
    utmSource === "facebook" || utmSource === "fb" ||
    utmMedium === "paid_social" ||
    referrer.includes("facebook.com")
  ) {
    return "facebook";
  }
  // Google organic
  if (utmSource === "google" || referrer.includes("google.")) {
    return "google_organic";
  }
  // LinkedIn
  if (utmSource === "linkedin" || referrer.includes("linkedin.")) {
    return "linkedin";
  }
  // Email campaigns
  if (utmSource === "email" || utmSource === "hs_email" || utmMedium === "email") {
    return "email";
  }
  // Referral — has a referring domain that isn't self
  if (referrer && !referrer.includes("arda.cards") && !referrer.includes("localhost")) {
    return "referral";
  }
  return "direct";
}

function actorCohort(actor: ActorJourney): ActorCohortKey {
  if (!actor.milestones.has("tour_started")) return "no_tour";
  if (actor.milestones.has("video_completed")) return "tour_completed";
  return "started_not_completed";
}

function actorFurthestMilestone(
  actor: ActorJourney,
  keys: ActivationJourneyMilestoneKey[],
): ActivationJourneyMilestoneKey | null {
  for (let i = keys.length - 1; i >= 0; i--) {
    if (actor.milestones.has(keys[i])) return keys[i];
  }
  return null;
}

/**
 * Resolve the sub-stage an event belongs to, if any. Only called for events that
 * are NOT a milestone's primary event, so sub-stages never double-count or
 * advance the funnel. The first matching sub-stage (in definition order) wins;
 * page-scoped predicates keep page-level events disjoint across stages.
 */
function subStageForEvent(
  event: NormalizedPostHogEvent,
): { milestoneKey: ActivationJourneyMilestoneKey; definition: SubStageDefinition } | null {
  return (
    subStageIndex.find(
      ({ definition }) =>
        definition.events.includes(event.event) &&
        (!definition.include || definition.include(event)),
    ) ?? null
  );
}

function ensureActorJourney(
  journeys: Map<string, ActorJourney>,
  event: NormalizedPostHogEvent,
): ActorJourney {
  const existing = journeys.get(event.actorId);
  if (existing) {
    if (event.occurredAt < existing.firstEventAt) {
      existing.firstEventAt = event.occurredAt;
      // Re-classify source from the genuinely earliest event
      existing.source = classifySource(event.properties);
    }
    if (!existing.sessionId && event.sessionId) {
      existing.sessionId = event.sessionId;
    }
    return existing;
  }

  const created: ActorJourney = {
    actorId: event.actorId,
    firstEventAt: event.occurredAt,
    sessionId: event.sessionId,
    milestones: new Map(),
    source: classifySource(event.properties),
  };
  journeys.set(event.actorId, created);
  return created;
}

function buildCohort(
  key: string,
  label: string,
  actors: ActorJourney[],
): ActivationJourneyCohort {
  const activatedActors = actors.filter((actor) =>
    actor.milestones.has("activation_completed"),
  ).length;

  return {
    key,
    label,
    actors: actors.length,
    activatedActors,
    activationRate: percent(activatedActors, actors.length),
  };
}

export async function buildActivationJourneyDashboard({
  prisma,
  context,
  now = new Date(),
  days = 30,
  from = null,
  to = null,
  all = false,
}: BuildActivationJourneyDashboardInput): Promise<ActivationJourneyDashboardPayload> {
  const boundedDays = Math.max(1, days);
  const windowEnd = to ?? now;
  // Precedence: all (everything) > explicit from > rolling `days` window.
  const windowStart = all
    ? new Date(0)
    : from ?? new Date(windowEnd.getTime() - boundedDays * 24 * 60 * 60 * 1000);
  const rows = await prisma.imladrisRawSourceRecord.findMany({
    where: {
      provider: IntegrationProvider.POSTHOG,
      objectType: "event",
      occurredAt: {
        gte: windowStart,
        lte: windowEnd,
      },
      ...(context.organizationId
        ? { organizationId: context.organizationId }
        : { userId: context.userId }),
    },
    orderBy: [{ occurredAt: "asc" }, { sourceUpdatedAt: "asc" }],
  } as never);

  const events = rows
    .map((row) => normalizeRawPostHogEvent(row))
    .filter((event): event is NormalizedPostHogEvent => event !== null);
  const journeys = new Map<string, ActorJourney>();
  const taxonomy = new Map<
    string,
    {
      event: string;
      mappedMilestone: ActivationJourneyMilestoneKey | null;
      subStages: Set<string>;
      count: number;
      actors: Set<string>;
      firstSeenAt: Date;
      lastSeenAt: Date;
    }
  >();
  const subStageMetrics = new Map<string, { count: number; actors: Set<string> }>();
  let unmappedEvents = 0;
  let subStageMappedEvents = 0;
  let systemEvents = 0;

  for (const event of events) {
    const milestoneKey = milestoneForEvent(event);
    // Only events that are NOT a milestone's primary event can fall through to a
    // sub-stage, so the two never overlap.
    const subStage = milestoneKey ? null : subStageForEvent(event);
    const actor = ensureActorJourney(journeys, event);
    const existingTaxonomy = taxonomy.get(event.event);

    if (existingTaxonomy) {
      existingTaxonomy.count += 1;
      existingTaxonomy.actors.add(event.actorId);
      existingTaxonomy.mappedMilestone ??= milestoneKey;
      if (subStage) existingTaxonomy.subStages.add(subStage.definition.key);
      if (event.occurredAt < existingTaxonomy.firstSeenAt) {
        existingTaxonomy.firstSeenAt = event.occurredAt;
      }
      if (event.occurredAt > existingTaxonomy.lastSeenAt) {
        existingTaxonomy.lastSeenAt = event.occurredAt;
      }
    } else {
      taxonomy.set(event.event, {
        event: event.event,
        mappedMilestone: milestoneKey,
        subStages: new Set(subStage ? [subStage.definition.key] : []),
        count: 1,
        actors: new Set([event.actorId]),
        firstSeenAt: event.occurredAt,
        lastSeenAt: event.occurredAt,
      });
    }

    if (subStage) {
      subStageMappedEvents += 1;
      const metric = subStageMetrics.get(subStage.definition.key) ?? {
        count: 0,
        actors: new Set<string>(),
      };
      metric.count += 1;
      metric.actors.add(event.actorId);
      subStageMetrics.set(subStage.definition.key, metric);
    }

    if (!milestoneKey) {
      // An event with neither a milestone nor a sub-stage home is either a known
      // system/plumbing event (excluded by design) or genuinely unmapped.
      if (!subStage) {
        if (SYSTEM_EVENTS.has(event.event)) systemEvents += 1;
        else unmappedEvents += 1;
      }
      continue;
    }

    const previous = actor.milestones.get(milestoneKey);
    if (!previous || event.occurredAt < previous) {
      actor.milestones.set(milestoneKey, event.occurredAt);
    }
  }

  const actors = [...journeys.values()];
  const milestones = milestoneDefinitions.map<ActivationJourneyMilestone>((definition, index) => {
    const matchingActors = actors.filter((actor) => actor.milestones.has(definition.key));
    // Conversion is computed against the previous milestone WITHIN THE SAME FUNNEL.
    // The first milestone of each funnel (and any milestone whose predecessor lives
    // in the other funnel) has no in-funnel parent → null. This is what stops
    // `signup` from being divided by `paid` across the marketing→activation boundary.
    const previousDefinition = index === 0 ? null : milestoneDefinitions[index - 1];
    const previousActorCount =
      previousDefinition && previousDefinition.funnel === definition.funnel
        ? actors.filter((actor) => actor.milestones.has(previousDefinition.key)).length
        : null;
    const conversionFromPrevious =
      previousActorCount === null ? null : percent(matchingActors.length, previousActorCount);
    const milestoneEvents = events.filter((event) => milestoneForEvent(event) === definition.key);

    return {
      key: definition.key,
      funnel: definition.funnel,
      label: definition.label,
      description: definition.description,
      status: matchingActors.length > 0 ? "instrumented" : "missing",
      actors: matchingActors.length,
      events: milestoneEvents.length,
      conversionFromPrevious,
      dropoffFromPrevious:
        conversionFromPrevious === null ? null : Math.round((100 - conversionFromPrevious) * 100) / 100,
      medianHoursFromFirstEvent: median(
        matchingActors
          .map((actor) => {
            const milestoneAt = actor.milestones.get(definition.key);
            if (!milestoneAt) return null;
            return (milestoneAt.getTime() - actor.firstEventAt.getTime()) / (60 * 60 * 1000);
          })
          .filter((value): value is number => value !== null && value >= 0),
      ),
      subStages: definition.subStages.map<ActivationJourneySubStage>((sub) => {
        const metric = subStageMetrics.get(sub.key);
        const count = metric?.count ?? 0;
        return {
          key: sub.key,
          label: sub.label,
          kind: sub.kind,
          description: sub.description,
          events: sub.events,
          status: count > 0 ? "instrumented" : "missing",
          eventCount: count,
          actors: metric?.actors.size ?? 0,
        };
      }),
    };
  });

  const activatedActors = actors.filter((actor) => actor.milestones.has("activation_completed"));
  const hoursToActivation = activatedActors
    .map((actor) => {
      const end = actor.milestones.get("activation_completed");
      if (!end) return null;
      return (end.getTime() - actor.firstEventAt.getTime()) / (60 * 60 * 1000);
    })
    .filter((value): value is number => value !== null && value >= 0);

  const pathMap = new Map<
    string,
    { sequence: ActivationJourneyMilestoneKey[]; actors: number; activatedActors: number }
  >();
  for (const actor of actors) {
    const sequence = milestoneDefinitions
      .filter((definition) => actor.milestones.has(definition.key))
      .map((definition) => definition.key);
    if (sequence.length === 0) continue;

    const pathKey = sequence.join(">");
    const existing = pathMap.get(pathKey) ?? {
      sequence,
      actors: 0,
      activatedActors: 0,
    };
    existing.actors += 1;
    if (actor.milestones.has("activation_completed")) {
      existing.activatedActors += 1;
    }
    pathMap.set(pathKey, existing);
  }

  const lastEventAt =
    events.length === 0
      ? null
      : new Date(Math.max(...events.map((event) => event.occurredAt.getTime()))).toISOString();
  // For the "all" view, report the actual earliest event as window.from (windowStart is epoch 0).
  const firstEventAt =
    events.length === 0
      ? null
      : new Date(Math.min(...events.map((event) => event.occurredAt.getTime())));
  const effectiveStart = all ? (firstEventAt ?? windowStart) : windowStart;
  const sourceStatus: SourceStatus =
    events.length === 0 ? "missing" : unmappedEvents > 0 || activatedActors.length === 0 ? "partial" : "ready";
  const observations: ActivationJourneyObservation[] = [];

  if (events.length === 0) {
    observations.push({
      title: "No PostHog events",
      detail: "The activation map is scaffolded, but live reporting needs synced PostHog raw events.",
      severity: "critical",
    });
  }
  if (unmappedEvents > 0) {
    observations.push({
      title: "Unmapped event names",
      detail: `${unmappedEvents} event${unmappedEvents === 1 ? "" : "s"} in this window do not map to an activation milestone.`,
      severity: "warning",
    });
  }
  observations.push({
    title: "Order semantics need sign-off",
    detail: "order_placed + card_fulfilled count as the 'order placed' milestone, and all_cards_fulfilled + cards_received complete activation; confirm this before using them as the activation purchase metric.",
    severity: "warning",
  });
  if (subStageMappedEvents > 0) {
    observations.push({
      title: "Sub-stage signals mapped",
      detail: `${subStageMappedEvents} event${subStageMappedEvents === 1 ? "" : "s"} (pageviews, sign-ins, file uploads, rage clicks, fulfillment, etc.) now feed milestone sub-stages instead of sitting unmapped.`,
      severity: "info",
    });
  }
  if (systemEvents > 0) {
    observations.push({
      title: "System events excluded",
      detail: `${systemEvents} PostHog system event${systemEvents === 1 ? "" : "s"} ($identify, $set, $session_summary_ready) are intentionally not attributed to a journey stage.`,
      severity: "info",
    });
  }
  const missingSubStages = milestones.flatMap((milestone) =>
    milestone.subStages.filter((sub) => sub.status === "missing"),
  );
  if (events.length > 0 && missingSubStages.length > 0) {
    observations.push({
      title: "Sub-stages awaiting data",
      detail: `${missingSubStages.length} sub-stage signal${missingSubStages.length === 1 ? "" : "s"} recorded no events in this window — either that stage saw no traffic, or the signal isn't reaching the sync yet.`,
      severity: "info",
    });
  }

  // ── New computations for the 3-tab dashboard ──────────────────────────

  const milestoneKeys = milestoneDefinitions.map((d) => d.key);

  // 1. Friction roll-up: aggregate rage_click + dead_click sub-stage counts per milestone
  const friction: FrictionSummary[] = milestoneDefinitions.map((def) => {
    let rageClicks = 0;
    let deadClicks = 0;
    for (const sub of def.subStages) {
      const metric = subStageMetrics.get(sub.key);
      if (!metric) continue;
      if (sub.kind === "rage_click") rageClicks += metric.count;
      if (sub.kind === "dead_click") deadClicks += metric.count;
    }
    return {
      milestoneKey: def.key,
      label: def.label,
      rageClicks,
      deadClicks,
      totalFriction: rageClicks + deadClicks,
    };
  });

  // 2. Sequential funnel: strict-order reach, RESTARTED at each funnel boundary so
  //    activation milestones aren't gated on having completed the marketing funnel.
  let sequentialSet: ActorJourney[] = [];
  let sequentialFunnelKey: ActivationFunnelKey | null = null;
  const sequentialFunnel: SequentialFunnelEntry[] = milestoneDefinitions.map((def) => {
    if (def.funnel !== sequentialFunnelKey) {
      sequentialSet = [...actors];
      sequentialFunnelKey = def.funnel;
    }
    sequentialSet = sequentialSet.filter((actor) => actor.milestones.has(def.key));
    const anyOrderActors = actors.filter((actor) => actor.milestones.has(def.key)).length;
    return {
      milestoneKey: def.key,
      label: def.label,
      sequentialActors: sequentialSet.length,
      anyOrderActors,
      sequentialRate: percent(sequentialSet.length, actors.length),
    };
  });

  // 3. Transition times: pairwise median hours between consecutive milestones
  const transitionTimes: TransitionTime[] = [];
  for (let i = 0; i < milestoneKeys.length - 1; i++) {
    // No cross-funnel transition: the marketing→activation hop is the bridge, not a step.
    if (milestoneDefinitions[i].funnel !== milestoneDefinitions[i + 1].funnel) continue;
    const fromKey = milestoneKeys[i];
    const toKey = milestoneKeys[i + 1];
    const durations: number[] = [];
    for (const actor of actors) {
      const fromAt = actor.milestones.get(fromKey);
      const toAt = actor.milestones.get(toKey);
      if (fromAt && toAt) {
        const hours = (toAt.getTime() - fromAt.getTime()) / (60 * 60 * 1000);
        if (hours >= 0) durations.push(hours);
      }
    }
    transitionTimes.push({
      from: fromKey,
      to: toKey,
      fromLabel: milestoneDefinitions[i].label,
      toLabel: milestoneDefinitions[i + 1].label,
      medianHours: median(durations),
      actors: durations.length,
    });
  }

  // 4. Actor samples: ~12 actors stratified by furthest milestone
  const byFurthest = new Map<string, ActorJourney[]>();
  for (const actor of actors) {
    const f = actorFurthestMilestone(actor, milestoneKeys) ?? "none";
    const bucket = byFurthest.get(f) ?? [];
    bucket.push(actor);
    byFurthest.set(f, bucket);
  }
  const actorSamples: ActorSample[] = [];
  // Prioritize later milestones (more interesting journeys)
  const furthestBucketOrder = ([...milestoneKeys].reverse() as string[]).concat("none");
  for (const key of furthestBucketOrder) {
    const bucket = byFurthest.get(key) ?? [];
    for (const actor of bucket.slice(0, 2)) {
      if (actorSamples.length >= 12) break;
      actorSamples.push({
        actorId: actor.actorId,
        source: actor.source,
        milestones: milestoneKeys.filter((k) => actor.milestones.has(k)),
        furthestMilestone: actorFurthestMilestone(actor, milestoneKeys),
        cohort: actorCohort(actor),
        ...postHogActorLinks(actor),
      });
    }
    if (actorSamples.length >= 12) break;
  }

  // 5. Compact actor journey summaries for client-side Sankey + segment computation
  const actorJourneys: ActorJourneySummary[] = actors.map((actor) => ({
    source: actor.source,
    milestones: milestoneKeys.filter((k) => actor.milestones.has(k)),
    furthest: actorFurthestMilestone(actor, milestoneKeys),
    cohort: actorCohort(actor),
  }));

  // ── End new computations ──────────────────────────────────────────────

  // ── Two-funnel split + non-linear bridge ──────────────────────────────
  const marketingFunnel = milestones.filter((milestone) => milestone.funnel === "marketing");
  const activationFunnel = milestones.filter((milestone) => milestone.funnel === "activation");

  // Bridge: trial ∪ paid → signup. `signup` has no single upstream parent, so this
  // is a set-union join (NOT a funnel step). Each signup is attributed to the
  // commercial event that preceded it, or "direct" (free/no preceding trial/paid).
  const commercialActors = actors.filter(
    (actor) => actor.milestones.has("trial") || actor.milestones.has("paid"),
  );
  const signups = actors.filter((actor) => actor.milestones.has("signup"));
  let postPaid = 0;
  let postTrial = 0;
  let direct = 0;
  for (const actor of signups) {
    const signupAt = actor.milestones.get("signup")!;
    const paidAt = actor.milestones.get("paid");
    const trialAt = actor.milestones.get("trial");
    if (paidAt && paidAt.getTime() <= signupAt.getTime()) {
      postPaid += 1;
    } else if (trialAt && trialAt.getTime() <= signupAt.getTime()) {
      postTrial += 1;
    } else {
      direct += 1;
    }
  }
  const commercialSignedUp = commercialActors.filter((actor) =>
    actor.milestones.has("signup"),
  ).length;
  const bridge: ActivationJourneyBridge = {
    commercialActors: commercialActors.length,
    signedUpActors: commercialSignedUp,
    conversionRate: percent(commercialSignedUp, commercialActors.length),
    signupAttribution: {
      postPaid,
      postTrial,
      direct,
      total: signups.length,
    },
  };

  return {
    summary: {
      totalEvents: events.length,
      identifiedActors: actors.length,
      activatedActors: activatedActors.length,
      activationRate: percent(activatedActors.length, actors.length),
      medianHoursToActivation: median(hoursToActivation),
      lastEventAt,
    },
    milestones,
    marketingFunnel,
    activationFunnel,
    bridge,
    cohorts: [
      buildCohort(
        "tour_completed",
        "Tour completed",
        actors.filter((actor) => actor.milestones.has("video_completed")),
      ),
      buildCohort(
        "tour_started_not_completed",
        "Tour started, not completed",
        actors.filter(
          (actor) =>
            actor.milestones.has("tour_started") && !actor.milestones.has("video_completed"),
        ),
      ),
      buildCohort(
        "no_tour",
        "No tour observed",
        actors.filter((actor) => !actor.milestones.has("tour_started")),
      ),
    ],
    paths: [...pathMap.values()]
      .map((path) => ({
        ...path,
        activationRate: percent(path.activatedActors, path.actors),
      }))
      .sort((left, right) => {
        if (right.activatedActors !== left.activatedActors) {
          return right.activatedActors - left.activatedActors;
        }
        return right.actors - left.actors;
      }),
    eventTaxonomy: [...taxonomy.values()]
      .map((row) => ({
        event: row.event,
        mappedMilestone: row.mappedMilestone,
        mappedSubStages: [...row.subStages].sort(),
        count: row.count,
        actors: row.actors.size,
        firstSeenAt: row.firstSeenAt.toISOString(),
        lastSeenAt: row.lastSeenAt.toISOString(),
      }))
      .sort((left, right) => right.count - left.count || left.event.localeCompare(right.event)),
    observations,
    source: {
      status: sourceStatus,
      unmappedEvents,
      subStageMappedEvents,
      systemEvents,
    },
    window: {
      from: effectiveStart.toISOString(),
      to: windowEnd.toISOString(),
      days: Math.max(1, Math.round((windowEnd.getTime() - effectiveStart.getTime()) / (24 * 60 * 60 * 1000))),
    },
    friction,
    sequentialFunnel,
    transitionTimes,
    actorSamples,
    actorJourneys,
  };
}
