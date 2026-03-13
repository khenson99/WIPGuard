# Ad Spend Optimization — Operator Report

**Date:** March 11, 2026
**Analysis period:** Last 30 days (Feb 9 – Mar 11, 2026), with trailing 90-day context
**Data sources:** HubSpot CRM (deals, contacts, lifecycle), Slack (#growthhit-ardacards weekly updates), Webflow (landing pages), Google Drive (performance tracker references)
**Limitations:** No direct API access to Google Ads, Meta Ads, GA4, Google Search Console, Hotjar, or Reddit Ads. Platform-level spend, impression, and keyword data is sourced from GrowthHit's weekly Slack reports and HubSpot attribution.

---

## A. Executive Summary

**Channels active:** Google Ads (search + PMax + new competitor campaign), Meta Ads (currently OFFLINE), Reddit Ads (recovering from billing pause)

**Last 30 days — HubSpot pipeline from paid sources:**

| Metric | Paid Search (Google) | Paid Social (Meta/Reddit) | Combined |
|---|---|---|---|
| New contacts (30d) | 76 | 13 | 89 |
| New deals created (30d) | 5 | 6 | 11 |
| Closed-won deals (2026 YTD) | 6 ($41.8K) | 4 ($11.5K) | 10 ($53.3K) |
| Open pipeline deals | ~17 | ~33 | ~70 |
| Largest open deal | Uline Distribution ($100K) | ITP ($3,598 - Demo Follow-Up) | Uline $100K |

**Best performers:**
- Google Ads is the primary growth driver — February demos up 70% vs. January
- New Google competitor campaign launched, cheapest clicks across platforms
- Founder-led and shopfloor-first video content outperforms all other Meta creative
- Kanban Card Creator page (/create-kanban-cards) is a strong top-of-funnel lead magnet
- Enterprise-tier wins from Paid Search: Nike ($25.5K), Bella+Canvas ($8.4K)

**Biggest waste / risk:**
- Meta Ads are OFFLINE due to billing/business verification issue — every day offline burns momentum and forces the algorithm to re-learn when resumed
- Reddit non-GH campaign absorbing ~35% of Reddit spend while underperforming the original campaign
- High no-show/reschedule rate on Paid Social deals (≥6 deals in No-Show stage) — may indicate lower intent from Meta/Reddit leads vs. Google

**Biggest opportunities:**
- Resolve Meta billing immediately — Meta has historically been the primary demo scaler
- Scale Google competitor campaign if early results hold
- Uline Distribution ($100K) in Demo Follow-Up — ensure sales follow-up is airtight
- Open March demo calendar fully — limited availability may be capping conversion from lead to booked demo

---

## B. Winners

**1. Google Ads — Demo volume leader**
Google drove most of the 70% increase in February demos (17 total, up from ~10 in January). The new competitor campaign is producing the cheapest clicks across platforms. Key closed-won deals from Paid Search in 2026 include Nike ($25,500), Bella+Canvas ($8,388), and c4 Manufacturing ($3,598). Google also sourced the $100K Uline Distribution opportunity now in Demo Follow-Up.

Evidence: HubSpot shows 76 new Paid Search contacts in the last 30 days vs. 13 from Paid Social. Deal creation from Paid Search has been consistent (5 deals in 30 days) with stronger downstream conversion quality.

**2. Founder-led video creative on Meta**
Per GrowthHit's Feb 9 update, the top 3 long-term performing videos are all founder-led formats, driving a meaningful share of Meta growth. The Oct 20 update showed Meta at $173 CPD (cost per demo) vs. Google at $1,023 CPD — when running well, Meta is significantly more cost-efficient at the top of funnel.

**3. Kanban Card Creator (/create-kanban-cards)**
This page functions as both an organic lead magnet and a paid landing page. Multiple closed-won deals cite this page as the first-touch URL (Growth via Payment Link, Ecosave Home Solutions, Bear Trailer, etc.). It captures intent-rich users who are already thinking about Kanban implementation.

**4. Case study pages and comparison hub**
Webflow has strong SEO-optimized case studies (Rossmonster, Austere, Fatfender, Assembly Industrial) and a comparison hub (/compare) with competitor pages like /arda-vs-eturns. These support paid traffic conversion by providing social proof.

---

## C. Losers

**1. Meta Ads — Currently offline (CRITICAL)**
Meta billing/business verification issue has taken ads offline. Per Slack, this was first flagged on Feb 25 and escalated on Mar 3 and Mar 9. As of Mar 10, Meta is still offline. This is the single biggest blocker to paid performance — Meta has historically been the primary demo scaler and cheapest channel for lead volume.

**2. Reddit non-GH campaign structure**
Per the Mar 2 update, ~35% of Reddit spend is allocated to a new campaign using Reddit's recommended structure, but the original GrowthHit campaign remains more cost-efficient with higher engagement. Spending 35% of budget on the underperformer without clear evidence of incremental lift is waste.

**3. Paid Social deals — high no-show rate**
Among open Paid Social deals, at least 6 are in the "No-Show/Reschedule" stage (Lee's, Straight Talk Advisory, Maxim Steel, Door Service Solutions, Cut N Dry Restoration, Shavitz R.A., Vazquez Electric, Fire Design Laser, Mill Creek Metal). This pattern suggests Meta/Reddit leads may have lower buying intent than Google leads, or that the ad-to-demo experience doesn't properly set expectations.

**4. Google Ads — historically expensive CPA**
While Google is improving (the competitor campaign is helping), Google's trailing CPA has been significantly higher than Meta's. September 2025 data showed Google at $1,655/week spend with 0 leads (vs. Meta at $933/week with 6 leads). This has improved, but Google still needs close monitoring on demo quality vs. cost.

---

## D. Changes Made Automatically

No direct changes were executed. The WIPGuard codebase has fully configured API credentials for Google Ads, Meta Ads, and Reddit Ads (fetcher functions in `src/lib/analytics/fetchers-ads.ts`), but the automation environment's sandboxed network prevented live API calls during this run. Platform-level spend, CPC, and campaign breakdowns could not be pulled directly — the data below relies on HubSpot attribution and GrowthHit's weekly Slack updates.

**To enable live platform data in future runs:** Run the ad-spend-optimization task from the WIPGuard server environment (where outbound API calls are permitted), or connect Google Ads, Meta Ads, and Reddit Ads APIs via MCP connectors.

---

## E. Recommended but Not Executed

| # | Platform | Action | Reason | Risk | Suggested Next Step |
|---|---|---|---|---|---|
| 1 | Meta | **Resolve billing/business verification IMMEDIATELY** | Every day offline = lost demos + algorithm reset | HIGH | Kyle/Uriel to update Meta Business Suite info. GrowthHit flagged this on Mar 3. |
| 2 | Reddit | **Cut non-GH campaign to 15% of Reddit spend (from 35%)** | Original campaign outperforms. Shift budget to proven performer. | LOW | Ask GrowthHit to reduce non-GH campaign and reallocate to original. |
| 3 | Google | **Monitor competitor campaign for 14 more days before scaling** | Cheapest clicks but need downstream conversion data. Don't scale on clicks alone. | MEDIUM | Review HubSpot deal creation from competitor campaign after Mar 25. |
| 4 | Google | **Add negative keywords for low-intent search terms** | HubSpot shows "Unknown keywords (SSL)" — need to audit search terms report in Google Ads. | LOW | Ask GrowthHit to pull search terms report and identify negatives. |
| 5 | All | **Open full March demo calendar** | Limited demo availability may be capping lead-to-booking conversion. Feb 24 update flagged only ~2 weeks available. | LOW | Expand calendar availability immediately. |
| 6 | Meta | **Launch distributor-led persona ad test** | Creative has been waiting for approval since at least Dec 15. Untested messaging angle. | MEDIUM | Approve creative in the Google Slides deck and greenlight launch. |
| 7 | Sales | **Priority follow-up on Uline Distribution ($100K)** | Largest deal in pipeline from Paid Search. Currently in Demo Follow-Up. | HIGH (revenue) | Ensure Uline has dedicated attention and next steps are clear. |
| 8 | Webflow | **Review new homepage (arda-cards012-v2-homepage)** | GrowthHit has a new homepage ready and is awaiting approval. A Loom video was shared Mar 9. | MEDIUM | Review Loom and approve or provide feedback. |

---

## F. Measurement and Attribution Issues

**1. Keyword masking — "Unknown keywords (SSL)"**
Nearly every Paid Search deal in HubSpot shows "Unknown keywords (SSL)" as the keyword data. This means we cannot determine which specific Google Ads keywords are driving the best deals. This is a known limitation of HubSpot's integration with Google Ads (keyword-level data is masked behind SSL). **Fix:** Use Google Ads search terms report directly, or implement enhanced conversion tracking / offline conversion import to match HubSpot deals back to keywords in Google Ads.

**2. Paid Social contacts dropped sharply (76 Paid Search vs. 13 Paid Social in 30 days)**
This is partly explained by Meta being offline and Reddit's billing pause, but the magnitude suggests possible tracking gaps. **Fix:** Verify UTM parameters are correctly configured on all active Meta and Reddit ads. Check GA4 to confirm Paid Social traffic is being captured.

**3. Multiple "Zaybra Subscription" deals from Paid Social**
There are several Zaybra Subscription deals attributed to Paid Social with $0 or $197 amounts. These appear to be self-service subscription deals, not sales-qualified demos. They may be inflating Paid Social deal counts without representing real pipeline. **Fix:** Clarify whether these should be in the sales pipeline or tracked separately as self-service revenue.

**4. Duplicate deal records**
Kazadi Enterprises appears twice — once as a $250 closed-won deal and once as a $3,598 demo-scheduled deal. **Fix:** Deduplicate and merge in HubSpot.

**5. No direct ad platform data accessible (this run)**
WIPGuard has fully configured API credentials for Google Ads (customer ID 7069544648), Meta Ads (ad account 19379220), and Reddit Ads (account a2_hnij4lqsklem) with OAuth refresh token flows. However, this automation run executed in a sandboxed environment without outbound network access, so live API calls failed. The analysis relies on HubSpot attribution and GrowthHit's weekly Slack updates. **Fix:** Run the optimization task from the WIPGuard server (production or local dev), or establish MCP connectors for direct ad platform access from the automation environment.

---

## G. Creative and Messaging Insights

**Winning hooks (from Slack + HubSpot patterns):**
- Founder-led video content (consistent top performer on Meta since October 2025)
- Shopfloor-first / "real manufacturing floor" creative
- Trade show content (ProMat, Fabtech footage converts)
- Case study-driven proof: "4x revenue," "80% less inventory," "95% backlog reduction"

**Losing / untested hooks:**
- Distributor-led persona ads (creative ready but unapproved since Dec 2025 — 3 months waiting)
- Software/AI-efficiency messaging angle (identified as needing validation per Feb 24 update)

**Objections that need better handling:**
- Without Reddit or Hotjar data access, specific objections can't be mined this run. However, Reddit was noted as showing strong appetite for informational/educational content — suggesting prospects want proof and education before committing.

**New ad angles to test:**
- Competitor comparison ads on Google (just launched — monitor)
- Distributor-led creative on Meta (approve and launch)
- "Evict VMI" messaging (strong on the new MODEX 2026 landing page — test in ads)
- Manufacturing-specific pain points: "No more spreadsheet chaos," "Reorder in 10 seconds"

---

## H. Landing Page Insights

**Best pages (likely high conversion):**
- `/create-kanban-cards` — Lead magnet / freemium entry. Multiple closed-won deals trace here. Strong SEO ("Free Kanban Card Generator").
- `/schedule-a-call` — Main demo booking page. Good SEO title and OG data.
- `/pricing` — Clean structure with trial CTA. Multiple social media deals reference this as first-touch.
- `/case-studies` and individual case study pages — Strong social proof with specific metrics (4x revenue, 80% less inventory, etc.)

**Pages with potential issues:**
- `/schedule-a-call-enterprise` — Exists as a separate page. May fragment demo booking attribution. Consider whether this should be the same page with enterprise routing.
- `/compare` and `/arda-vs-eturns` — Good for competitor campaigns. Ensure these are landing pages for the new Google competitor ads.
- New homepage (`/archived/arda-cards012-v2-homepage`) — Currently in staging/archived, waiting for approval. Includes new CTA and footer. GrowthHit team flagged that backend changes by others wiped some of their work — coordinate deployments.

**Recommendations:**
- Ensure Google competitor ads point to the relevant /compare or /arda-vs-[competitor] pages, not just the homepage
- Review Hotjar data (when connected) for scroll depth and form friction on /schedule-a-call
- The MODEX 2026 page has strong "Evict VMI" messaging — test this language in ads
- Blog and resource hub pages (/kanban-manufacturing-resource-hub, /stockout-guide) are good for Reddit/organic but ensure they have clear CTAs to demo booking

---

## I. 7-Day Action Plan

**Immediate (today):**
1. Resolve Meta billing/business verification — this is the #1 blocker
2. Approve distributor-led creative test so it can launch when Meta is back
3. Review and approve new homepage Loom (shared Mar 9)

**This week:**
4. Reduce Reddit non-GH campaign from 35% to 15% of Reddit budget
5. Ensure full March demo calendar is open
6. Priority sales follow-up on Uline Distribution ($100K deal)
7. Ask GrowthHit to pull Google Ads search terms report for negative keyword audit

**Monitor over next 7–14 days:**
8. Google competitor campaign — watch for demo conversions, not just clicks
9. Meta re-learning period when ads resume (expect 7–14 days of softer performance)
10. Reddit original campaign vs. non-GH campaign performance delta

**Next run:**
11. Connect Google Ads, Meta, GA4, and Reddit APIs for direct data access and autonomous optimization

---

## J. Final Execution Summary

| Item | Status |
|---|---|
| **Data sources analyzed** | HubSpot CRM, Slack (#growthhit-ardacards), Webflow, Google Drive |
| **Date ranges used** | 30-day (Feb 9 – Mar 11), 90-day trailing context, 2026 YTD |
| **Tracking health** | DEGRADED — keyword data masked, Meta offline, Paid Social contact volume anomalously low, duplicate deals present |
| **Campaigns scaled** | None (no API access) |
| **Campaigns reduced** | None (no API access) — RECOMMEND reducing Reddit non-GH campaign |
| **Campaigns paused** | None (no API access) — Meta self-paused due to billing |
| **Negatives/exclusions added** | None (no API access) — RECOMMEND search terms audit |
| **Landing pages flagged** | New homepage awaiting approval; competitor landing pages should be verified for Google competitor campaign |
| **Tasks/briefs created** | 8 recommendations documented above |
| **Unresolved blockers** | Meta billing (CRITICAL), sandbox network blocked live API calls (creds configured but need server-side execution), distributor creative unapproved for 3 months, demo calendar capacity constraints |
