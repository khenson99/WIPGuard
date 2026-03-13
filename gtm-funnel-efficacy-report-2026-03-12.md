# GTM Funnel Efficacy Report

**Date:** March 12, 2026
**Analyst:** GTM Efficacy Operator (automated)
**Analysis period:** Last 30 days (Feb 10 – Mar 12, 2026), with trailing 90-day and all-time context
**Data sources:** HubSpot CRM (722 deals, contacts, companies, lifecycle, deal stages), Webflow (52 pages, site structure), Gmail (email patterns, follow-up behavior), Slack (GrowthHit weekly updates via prior ad-spend report), prior ad-spend-optimization-report (Mar 11, 2026)
**Limitations:** No direct API access to Google Ads, Meta Ads, GA4, Reddit Ads, Stripe, Mercury, Pylon, RB2B, Unify, or Clay from this execution environment. Platform-level spend, impression, keyword, and session data is sourced from HubSpot attribution and the prior ad-spend report. GitHub CLI not authenticated.

---

## A. Executive Summary

**Total funnel: 722 deals across 19 CRM stages.** The system is generating meaningful pipeline but has severe conversion leaks at two critical junctures: the demo no-show stage and the demo follow-up to close stage.

**Biggest leaks found:**

1. **55 deals (19.6% of demo funnel) stuck in No-Show/Reschedule** — $197K+ in potential pipeline value sitting dead. Paid Social is the worst offender at 13 no-shows. This is the single most impactful conversion leak by volume.
2. **83 deals sitting in Demo Follow-Up** — many for 3-6+ months without progression. $181K in high-value enterprise pipeline alone (Uline $100K, Boon Edam $16.8K, Thermo Scientific $15K, Gecko Robotics $15K, Tesla $5K). Stale follow-up is the biggest revenue leak.
3. **Meta Ads offline since ~Feb 25** — historically the cheapest demo channel ($173 CPD vs Google $1,023 CPD). Every day offline burns algorithm learning and demo volume. This is the biggest addressable acquisition blocker.

**Biggest revenue/pipeline opportunities:**

- Uline Distribution: $100,000 deal in Demo Follow-Up (Paid Search) — needs urgent sales execution
- Enterprise pipeline: $181K across 8 high-value Demo Follow-Up deals
- 2026 YTD closed-won: $52,984 from 16 deals
- Paid Search driving highest revenue per deal ($5,970 avg vs $2,032 for Social Media)
- Google competitor campaign producing cheapest clicks (needs downstream conversion monitoring)

**Biggest tracking/data-quality issues:**

- HubSpot keyword data masked as "Unknown keywords (SSL)" — cannot attribute revenue to specific Google Ads keywords
- Multiple "Zaybra Subscription" deals from self-serve path polluting sales pipeline deal counts
- Kazadi Enterprises duplicate deal records
- 21 no-show deals attributed to OFFLINE source — likely broken UTM/attribution on inbound demos
- Paid Social contact volume anomalously low (13 vs 76 Paid Search in 30 days) — partly Meta offline, partly possible tracking gap

**Biggest operational bottlenecks:**

- Demo follow-up latency: 83 deals stuck with no stage progression, many 3-6+ months old
- No-show recovery: 55 deals with no evidence of systematic re-engagement workflow
- No clear deal stage exit criteria or SLA enforcement visible in HubSpot
- Demo calendar capacity flagged as limited (only ~2 weeks available per Feb 24 update)

**Top tickets created:** 8 tickets (see Section E)

---

## B. Funnel Map

### Observed Funnel Stages (from HubSpot)

```
Impression → Click → Landing Page Session → Form/Demo Request
    ↓
Demo Scheduled (2 active)
    ↓
┌─────────────────────────────────────┐
│  Demo Held                          │
│  ├→ No-Show/Reschedule (55)  ←LEAK │
│  └→ Demo Follow-Up (83)            │
│       ├→ Budgetary Quote Sent       │
│       ├→ Payment Link Sent          │
│       ├→ Free Trial                 │
│       ├→ Interested in Pilot        │
│       ├→ Closed Won (105)           │
│       ├→ Closed Lost (36)           │
│       └→ Ping Later / On Hold       │
└─────────────────────────────────────┘

Parallel: Subscriptions / Self-Serve (79 deals)
```

### Stage Distribution (722 total deals)

| Stage | Count | % of Total | Pipeline Value |
|---|---|---|---|
| Subscriptions (self-serve) | 79 | 10.9% | Low-value self-serve |
| Demo Follow-Up | 83 | 11.5% | ~$340K+ (incl. $181K enterprise) |
| No-Show/Reschedule | 55 | 7.6% | ~$197K potential |
| Closed Won | 105 | 14.5% | $300K+ all-time |
| Closed Lost | 36 | 5.0% | — |
| Demo Scheduled | 2 | 0.3% | $3,598 |
| Other stages | ~362 | 50.1% | Various |

### Stage-to-Stage Conversion Rates

| Transition | Rate | Notes |
|---|---|---|
| Demo Created → Demo Held | **80.4%** | 224 held of ~281 total demo-funnel deals |
| Demo Created → No-Show | **19.6%** | 55 of 281 — severe leak |
| Demo Held → Closed Won | **46.9%** | 105 of 224 (strong when demo happens) |
| Demo Held → Closed Lost | **16.1%** | 36 of 224 |
| Demo Held → Still in Pipeline | **37.1%** | 83 of 224 (stale pipeline risk) |

### Conversion by Source (2026 YTD Closed-Won)

| Source | Deals Won | Revenue | Avg Deal |
|---|---|---|---|
| PAID_SEARCH | 5 | $29,848 | $5,970 |
| SOCIAL_MEDIA | 3 | $6,095 | $2,032 |
| PAID_SOCIAL | 2 | $5,746 | $2,873 |
| OFFLINE | 3 | $3,848 | $1,283 |
| REFERRALS | 1 | $3,500 | $3,500 |
| DIRECT_TRAFFIC | 1 | $2,148 | $2,148 |
| ORGANIC_SEARCH | 1 | $1,799 | $1,799 |
| **TOTAL** | **16** | **$52,984** | **$3,312** |

---

## C. Highest-Impact Drop-offs

### Drop-off #1: Demo Follow-Up → Closed Won (Stale Pipeline)

- **Stage:** Demo Follow-Up
- **Volume affected:** 83 deals, many 3-6+ months with no progression
- **Segments:** Disproportionately SOCIAL_MEDIA source (47 of 83 = 56.6%)
- **Evidence:** Multiple enterprise deals (Uline $100K, Boon Edam $16.8K, Thermo Scientific $15K, Gecko Robotics $15K) sitting in follow-up for months. Many deals from May-Sep 2025 still active with no recent modification.
- **Downstream revenue impact:** $181K in named high-value pipeline alone. If overall follow-up-to-close rate improved from current ~56% to 65%, that's ~7 additional closed deals worth ~$25K.
- **Likely root cause:** No automated follow-up SLA. No deal stage exit criteria enforced. Deals languishing without owner accountability or re-engagement automation.
- **Confidence:** HIGH
- **Expected Impact Score:** 9.2/10

### Drop-off #2: Demo Scheduled → No-Show/Reschedule

- **Stage:** No-Show/Reschedule
- **Volume affected:** 55 deals (~$197K potential pipeline)
- **Segments:** PAID_SOCIAL accounts for 13 no-shows (24% of all no-shows from just one channel), suggesting lower intent from Meta/Reddit leads. OFFLINE attribution at 21 no-shows is suspicious — likely broken attribution masking the true source.
- **Evidence:** No-show rate of 19.6% across the funnel. Paid Social no-show rate likely 30%+ when adjusted for attribution gaps.
- **Downstream revenue impact:** At a 47% demo-to-won rate and $3,312 avg deal value, recovering even 20% of no-shows = ~5 additional closed deals = ~$17K revenue.
- **Likely root cause:** Combination of (a) low-intent paid social leads not properly qualified pre-demo, (b) no automated reminder/confirmation sequence, (c) poor expectation-setting in ad-to-booking flow, (d) possible calendar friction.
- **Confidence:** HIGH
- **Expected Impact Score:** 7.8/10

### Drop-off #3: Meta Ads Offline (Acquisition Channel Failure)

- **Stage:** Top-of-funnel acquisition
- **Volume affected:** All Meta-sourced pipeline
- **Evidence:** Meta historically produced $173 CPD vs Google $1,023 CPD. Offline since ~Feb 25 (16+ days). Paid Social contacts dropped to 13 (30-day) vs 76 for Paid Search.
- **Downstream revenue impact:** If Meta generates ~4 demos/week at $173 CPD and 47% demo-to-won rate, 16 days offline = ~9 lost demos = ~4 lost deals = ~$13K revenue.
- **Likely root cause:** Billing/business verification issue. Not a funnel problem — an operational blocker.
- **Confidence:** VERY HIGH (confirmed in Slack and prior report)
- **Expected Impact Score:** 8.5/10

### Drop-off #4: Attribution Blind Spots (Measurement Failure)

- **Stage:** Cross-funnel
- **Volume affected:** All paid search deals (keyword data masked), 21 OFFLINE no-shows (likely misattributed)
- **Evidence:** Every Paid Search deal shows "Unknown keywords (SSL)." OFFLINE is the largest source of no-shows (21) despite being an unlikely organic source for low-intent demos. Zaybra Subscription deals polluting pipeline metrics.
- **Downstream revenue impact:** Cannot optimize Google Ads spend without keyword-level conversion data. Cannot diagnose true channel quality when attribution is broken.
- **Likely root cause:** HubSpot SSL keyword masking, broken UTM persistence on Webflow forms, and missing pipeline/stage segmentation for self-serve vs sales-led deals.
- **Confidence:** HIGH
- **Expected Impact Score:** 6.5/10

---

## D. Cross-System Failure Analysis

### 1. Webflow → HubSpot Attribution Loss
**Problem:** UTM parameters from paid ads are not reliably persisting through the Webflow form submission to HubSpot contact/deal creation. Evidence: 21 no-show deals and 18 follow-up deals attributed to "OFFLINE" source — these are almost certainly paid or organic traffic with dropped tracking.
**Impact:** Cannot measure true channel ROI. Paid channels may be performing better (or worse) than HubSpot reports.
**Fix needed:** Audit Webflow form hidden fields, ensure UTM capture in form submission, verify HubSpot workflow maps UTMs to contact original source.

### 2. Google Ads → HubSpot Keyword Masking
**Problem:** SSL encryption masks keyword-level data in HubSpot integration. All Paid Search deals show "Unknown keywords (SSL)."
**Impact:** Cannot identify which keywords drive the best deals (Nike $25.5K, Bella+Canvas $8.4K, c4 Manufacturing $3.6K all came from unknown keywords).
**Fix needed:** Implement Google Ads offline conversion import using GCLID, or use GA4 as an intermediate attribution layer.

### 3. Self-Serve (Stripe/Zaybra) → HubSpot Pipeline Pollution
**Problem:** Zaybra Subscription deals ($0 and $197 amounts) from self-serve checkout are being created in the same sales pipeline as demo-qualified deals.
**Impact:** Inflates deal counts. Makes conversion rate analysis unreliable. Self-serve and sales-led motions need separate tracking.
**Fix needed:** Create a separate pipeline or deal type for self-serve subscriptions, or filter them from sales pipeline views.

### 4. Demo Booking → CRM Follow-up Gap
**Problem:** 83 deals in Demo Follow-Up with many showing no recent modification for months. No evidence of automated task creation, follow-up email sequences, or SLA alerting.
**Impact:** Enterprise deals worth $181K+ languishing without structured follow-up.
**Fix needed:** Implement post-demo workflow automation — automatic task creation at 24h, 72h, and 7d post-demo, escalation to manager if no activity after 14d.

### 5. No-Show → Re-engagement Gap
**Problem:** 55 deals in No-Show/Reschedule with no evidence of systematic re-engagement automation.
**Impact:** $197K in potential pipeline with no recovery workflow.
**Fix needed:** Automated no-show email sequence (immediate reschedule link, 24h follow-up, 7d value-add touch) with task assignment to deal owner.

---

## E. Ticket Summary

### Ticket GTM-001: Resolve Meta Ads Billing/Verification (CRITICAL)

**Funnel stage:** Acquisition
**Problem:** Meta Ads have been offline since ~Feb 25 due to billing/business verification issue. This is the single biggest blocker to paid performance. Meta historically is the cheapest demo channel ($173 CPD vs Google $1,023 CPD).
**Evidence:** Paid Social contacts dropped from normal levels to 13 in 30 days. First flagged in Slack on Feb 25, escalated Mar 3 and Mar 9, still unresolved as of Mar 11.
**Root cause:** Meta Business Suite billing/verification configuration issue (operational, not funnel).
**Proposed fix:** Kyle/Uriel to complete Meta Business Suite verification. If blocked, escalate directly to Meta support or use a Meta Business Partner for expedited resolution.
**Owner:** Kyle + Uriel (GrowthHit)
**Priority:** P0 (CRITICAL)
**Expected impact:** Restore ~4 demos/week, ~$13K+ monthly revenue pipeline
**Confidence:** VERY HIGH
**Effort:** Low (administrative, not technical)
**Acceptance criteria:** Meta ads delivering impressions again, cost per demo returning to $200 range within 14 days of re-launch
**Monitor:** Meta CPD, demo volume from Paid Social in HubSpot
**Labels:** stage/acquisition, source/meta, type/process, severity/high

---

### Ticket GTM-002: Implement Post-Demo Follow-Up SLA and Automation

**Funnel stage:** Sales / Demo Follow-Up
**Problem:** 83 deals stuck in Demo Follow-Up, many for 3-6+ months. No automated follow-up tasks, no SLA enforcement, no escalation. $181K in enterprise pipeline (Uline $100K, Boon Edam $16.8K, Thermo Scientific $15K, Gecko Robotics $15K, Tesla $5K) aging without structured next steps.
**Evidence:** 47 of 83 follow-up deals are from SOCIAL_MEDIA source, many created May-Sep 2025 with no stage change. High-value deals like Uline have been in follow-up since Nov 2025.
**Root cause:** No workflow automation between demo completion and deal progression. No task SLA. No escalation path.
**Proposed fix:**
1. Create HubSpot workflow: auto-create task at 24h, 72h, 7d, and 14d post-demo
2. Add SLA property to deals (days since last activity)
3. Escalation alert to manager if no activity after 14 days
4. Immediate priority: Manual outreach to Uline ($100K), Boon Edam ($16.8K), Thermo Scientific ($15K), Tesla ($5K)
**Owner:** Sales + RevOps
**Priority:** P1 (HIGH)
**Expected impact:** 7+ additional closed deals worth ~$25K if follow-up-to-close improves by 10%
**Confidence:** HIGH
**Effort:** Medium (HubSpot workflow + manual outreach)
**Acceptance criteria:** All Demo Follow-Up deals have scheduled next-step tasks within 7 days; SLA alerting active
**Monitor:** Demo Follow-Up deal count, time-in-stage, deal velocity
**Labels:** stage/sales, source/hubspot, type/automation, type/process, severity/high

---

### Ticket GTM-003: Build No-Show Recovery Automation

**Funnel stage:** Demo / No-Show Recovery
**Problem:** 55 deals (19.6% of demo funnel) in No-Show/Reschedule with no systematic re-engagement. Paid Social is the worst source (13 no-shows = 24% of all no-shows).
**Evidence:** No-show rate consistent across 6+ months of data. No evidence of automated reschedule sequences in HubSpot.
**Root cause:** No post-no-show workflow. Leads go cold without re-engagement.
**Proposed fix:**
1. Create automated email sequence: immediate reschedule link (within 5 min of no-show), 24h follow-up with value prop, 7d content-driven touch
2. Add SMS reminder option for booked demos (if tool supports)
3. For Paid Social leads specifically: add a pre-demo qualification step (short form or auto-reply setting expectations)
4. Track no-show recovery rate as a KPI
**Owner:** RevOps + Sales
**Priority:** P1 (HIGH)
**Expected impact:** Recover 20% of no-shows = ~5 deals = ~$17K revenue
**Confidence:** HIGH
**Effort:** Medium (email automation + workflow)
**Acceptance criteria:** No-show recovery email fires within 5 min; no-show rate drops below 15% within 60 days
**Monitor:** No-show rate by source, reschedule rate, no-show-to-held conversion
**Labels:** stage/sales, source/hubspot, type/automation, severity/high

---

### Ticket GTM-004: Fix UTM Attribution on Webflow Forms

**Funnel stage:** Routing / Attribution
**Problem:** 21 no-show deals and 18 follow-up deals attributed to "OFFLINE" source — almost certainly misattributed paid or organic traffic. UTM parameters are being lost between ad click → landing page → form submission → HubSpot contact creation.
**Evidence:** OFFLINE is the single largest source of no-shows (21 of 55 = 38%), which is implausible for truly offline-sourced demos. These are likely paid leads with dropped UTMs.
**Root cause:** Webflow forms likely not capturing UTM parameters in hidden fields, or HubSpot workflows not mapping captured UTMs to original source properties.
**Proposed fix:**
1. Audit all Webflow forms (especially /schedule-a-call and /create-kanban-cards) for UTM hidden field capture
2. Verify URL parameter persistence across page navigation
3. Verify HubSpot workflow maps form UTMs to contact source fields
4. Test end-to-end: click Google Ad → land on page → fill form → verify source in HubSpot
**Owner:** RevOps + Web Dev
**Priority:** P1 (HIGH)
**Expected impact:** Accurate channel ROI measurement. Ability to optimize ad spend based on true downstream conversion.
**Confidence:** HIGH
**Effort:** Low-Medium (form field audit + workflow fix)
**Acceptance criteria:** OFFLINE attribution for demo-sourced deals drops below 10% of total within 30 days
**Monitor:** % of deals with OFFLINE source, UTM presence on new contacts
**Labels:** stage/routing, source/webflow, source/hubspot, type/tracking, type/data-quality, severity/high

---

### Ticket GTM-005: Implement Google Ads Offline Conversion Import

**Funnel stage:** Attribution / Measurement
**Problem:** All Paid Search deals show "Unknown keywords (SSL)" in HubSpot. Cannot determine which Google Ads keywords drive the best deals (Nike $25.5K, Bella+Canvas $8.4K, c4 Mfg $3.6K all from unknown keywords).
**Evidence:** 100% of Paid Search deals in HubSpot have masked keyword data.
**Root cause:** SSL encryption in HubSpot's native Google Ads integration.
**Proposed fix:**
1. Capture GCLID on Webflow forms (hidden field)
2. Implement Google Ads offline conversion import — push HubSpot deal events (demo booked, demo held, closed won) back to Google Ads with GCLID
3. This enables Google's smart bidding to optimize for downstream revenue, not just clicks
**Owner:** RevOps + GrowthHit
**Priority:** P2 (MEDIUM)
**Expected impact:** Keyword-level optimization could reduce CPA by 20-30% and shift spend to highest-converting keywords
**Confidence:** MEDIUM (depends on GCLID capture feasibility)
**Effort:** Medium (GCLID capture + conversion import setup)
**Acceptance criteria:** GCLID captured on 90%+ of Paid Search form submissions; offline conversions importing to Google Ads weekly
**Monitor:** Google Ads conversion data quality, CPA trend
**Labels:** stage/acquisition, source/google-ads, source/hubspot, type/tracking, severity/medium

---

### Ticket GTM-006: Separate Self-Serve Pipeline from Sales Pipeline

**Funnel stage:** CRM / Data Quality
**Problem:** Zaybra Subscription deals ($0 and $197 amounts) from self-serve Stripe checkout are in the same HubSpot sales pipeline as demo-qualified deals. This inflates deal counts and corrupts conversion rate analysis.
**Evidence:** Multiple "Zaybra Subscription" deals with $0-$197 amounts attributed to DIRECT_TRAFFIC and PAID_SOCIAL. These are self-serve purchases, not sales-qualified demos.
**Root cause:** No pipeline segmentation between self-serve and sales-led motions.
**Proposed fix:**
1. Create a separate HubSpot pipeline (e.g., "Self-Serve / Subscriptions") for Zaybra-originated deals
2. Retroactively move existing Zaybra Subscription deals to the new pipeline
3. Update Zaybra integration to route new self-serve deals to the correct pipeline
4. Ensure reporting filters distinguish self-serve from sales-led revenue
**Owner:** RevOps
**Priority:** P2 (MEDIUM)
**Expected impact:** Clean pipeline reporting. Accurate conversion rate analysis for sales-led motion.
**Confidence:** HIGH
**Effort:** Low (HubSpot pipeline creation + deal moves)
**Acceptance criteria:** No Zaybra Subscription deals in sales pipeline; separate self-serve dashboard
**Monitor:** Pipeline deal counts, conversion rate accuracy
**Labels:** stage/billing, source/hubspot, type/data-quality, severity/medium

---

### Ticket GTM-007: Reduce Reddit Non-GH Campaign Budget Allocation

**Funnel stage:** Acquisition / Paid
**Problem:** ~35% of Reddit ad spend allocated to a new campaign using Reddit's recommended structure, but the original GrowthHit campaign outperforms it with higher engagement and lower cost.
**Evidence:** Per GrowthHit's Mar 2 Slack update, the non-GH campaign absorbs ~35% of budget while the original campaign is more cost-efficient.
**Root cause:** Campaign structure experiment not delivering. Budget allocation not adjusted based on performance.
**Proposed fix:** Reduce non-GH campaign allocation from 35% to 15% of Reddit budget. Reallocate to the original GrowthHit campaign.
**Owner:** GrowthHit
**Priority:** P2 (MEDIUM)
**Expected impact:** Reduce Reddit waste by ~20% of Reddit spend. Improve Reddit demos/$.
**Confidence:** MEDIUM (based on Slack report, not direct platform data)
**Effort:** Low (budget reallocation)
**Acceptance criteria:** Non-GH campaign at 15% of Reddit budget; overall Reddit CPD improves
**Monitor:** Reddit campaign-level CPA, demo volume
**Labels:** stage/acquisition, source/reddit, type/experiment, severity/medium

---

### Ticket GTM-008: Deduplicate HubSpot Records and Clean CRM Hygiene

**Funnel stage:** CRM / Data Quality
**Problem:** Duplicate deal records identified (Kazadi Enterprises appears twice — $250 closed-won and $3,598 demo-scheduled). Likely additional duplicates across 722 deals. Some deals have blank names. Some contacts may have duplicates.
**Evidence:** Kazadi Enterprises dual entry. One unnamed closed-won deal ($1,799). High OFFLINE attribution suggests possible duplicate contact/deal creation paths.
**Root cause:** No deduplication workflow. Multiple form submissions or manual deal creation creating duplicates.
**Proposed fix:**
1. Run HubSpot deduplication tool on deals and contacts
2. Merge Kazadi Enterprises records
3. Add deal name validation (require non-empty)
4. Consider HubSpot Operations Hub for ongoing dedup automation
**Owner:** RevOps
**Priority:** P3 (LOW)
**Expected impact:** Cleaner reporting. More accurate funnel metrics.
**Confidence:** HIGH
**Effort:** Low (manual dedup + workflow)
**Acceptance criteria:** Zero known duplicate deals; deal name required on creation
**Monitor:** Duplicate deal count (periodic audit)
**Labels:** stage/routing, source/hubspot, type/data-quality, severity/low

---

## F. Measurement Confidence

### Trustworthy Data
- **HubSpot deal stage distribution:** HIGH confidence. 722 deals with clear stage mapping.
- **Closed-won revenue by source:** HIGH confidence for PAID_SEARCH, SOCIAL_MEDIA, ORGANIC_SEARCH. These sources are likely accurate.
- **No-show count and rate:** HIGH confidence. 55 deals in stage with consistent pattern.
- **Demo follow-up stale pipeline:** HIGH confidence. Cross-verified with deal modification dates.

### Ambiguous Data
- **OFFLINE source attribution:** LOW confidence. 21 OFFLINE no-shows and 18 OFFLINE follow-ups are likely misattributed paid/organic traffic. Real OFFLINE count is probably 30-50% of reported.
- **Paid Social performance:** MEDIUM confidence. Meta offline since Feb 25 distorts recent numbers. Trailing data (pre-outage) is more reliable.
- **Self-serve vs sales-led separation:** LOW confidence. Zaybra deals mixed into sales pipeline.
- **Keyword-level Google Ads performance:** NOT AVAILABLE. SSL masking prevents analysis.

### Needs Instrumentation First
- Direct Google Ads, Meta Ads, Reddit Ads API access (spend, CPC, CPM, CTR, keyword performance)
- GA4 session and event data (landing page conversion, user paths, form analytics)
- Stripe subscription and payment event data (checkout completion, failed payments, churn)
- Webflow form submission tracking (UTM capture verification)
- Pylon support/onboarding data (customer health signals)
- RB2B visitor identification coverage
- Mercury cash receipt timing

---

## G. 30-Day Recommendation Stack

### Quick Wins (This Week)

1. **Resolve Meta billing** — P0, operational blocker, no technical work required
2. **Manual outreach to Uline ($100K), Boon Edam ($16.8K), Thermo Scientific ($15K), Tesla ($5K)** — highest-value deals aging without structured follow-up
3. **Reduce Reddit non-GH campaign to 15%** — simple budget shift, low risk
4. **Open full March demo calendar** — capacity constraint may be capping conversion
5. **Approve distributor-led creative test** — 3 months waiting, ready to launch when Meta returns

### Medium-Effort Changes (Weeks 2-3)

6. **Build no-show recovery email sequence** — automated reschedule + value-add touches
7. **Build post-demo follow-up SLA workflow** — auto-tasks at 24h/72h/7d/14d with escalation
8. **Audit and fix UTM capture on Webflow forms** — end-to-end attribution test
9. **Create separate self-serve pipeline** — clean sales pipeline from Zaybra deals
10. **Run HubSpot deduplication** — merge Kazadi and other duplicates

### Bigger Structural Fixes (Weeks 3-4)

11. **Implement GCLID capture + Google Ads offline conversion import** — enables keyword-level optimization and smart bidding
12. **Connect ad platform APIs to WIPGuard** — enable autonomous spend optimization in future runs
13. **Review and approve new homepage** — GrowthHit has it ready with Loom walkthrough
14. **Monitor Google competitor campaign for downstream conversions** — 14 more days before scaling decision

### Monitor Next Run

- Meta re-learning period (expect 7-14 days of softer performance when ads resume)
- Google competitor campaign demo conversion rate (not just clicks)
- No-show rate trend after automation is live
- Demo Follow-Up deal aging and velocity improvement
- OFFLINE attribution rate (should decrease after UTM fix)

---

## H. Final Execution Summary

| Item | Status |
|---|---|
| **Date ranges analyzed** | 30-day (Feb 10 – Mar 12), 90-day trailing, 2026 YTD, all-time |
| **Tools used** | HubSpot CRM, Webflow, Gmail, Slack (via prior report), WIPGuard filesystem |
| **Tools NOT accessible** | Google Ads, Meta Ads, GA4, Reddit Ads, Stripe, Mercury, Pylon, RB2B, Unify, Clay, GitHub |
| **Confidence in instrumentation** | DEGRADED — UTM attribution broken, keyword data masked, self-serve polluting sales pipeline, Meta offline |
| **Top drop-offs found** | (1) Stale Demo Follow-Up (83 deals/$181K enterprise), (2) No-Show at 19.6%, (3) Meta offline, (4) Attribution blind spots |
| **Tickets created** | 8 (GTM-001 through GTM-008) |
| **Tickets updated** | 0 (no pre-existing ticket files found) |
| **Tickets reopened** | 0 |
| **Biggest unresolved unknowns** | True channel CPA (no ad platform data), Stripe checkout/churn patterns, GA4 session-level funnel, Pylon support signals, RB2B coverage |
| **Highest-priority next actions** | (1) Fix Meta billing, (2) Manual outreach to $181K enterprise pipeline, (3) Build no-show + follow-up automation |

---

*Report generated by GTM Funnel Efficacy Operator. Next run should prioritize connecting Google Ads, Meta Ads, GA4, and Stripe APIs for direct platform data access.*
