export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { DealStage, MeetingStatus } from "@/generated/prisma/client";
import { toDealsErrorResponse } from "@/lib/deals/schema-guard";

const OPEN_STAGES: DealStage[] = [DealStage.LEAD, DealStage.QUALIFIED, DealStage.PROPOSAL, DealStage.NEGOTIATION];
const STALE_THRESHOLD_DAYS = 14;

function getOptionalOrganizationId(session: unknown): string | null {
  const orgId = (session as { user?: { organizationId?: unknown } } | null | undefined)?.user
    ?.organizationId;
  return typeof orgId === "string" && orgId.trim() ? orgId : null;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs(b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24);
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const organizationId = getOptionalOrganizationId(session);
    const organizationFilter = organizationId ? { organizationId } : {};

    const [allDeals, allMeetings, allHistory] = await Promise.all([
      prisma.deal.findMany({
        where: organizationFilter,
        include: {
          company: { select: { id: true, name: true } },
          meetings: { select: { startAt: true }, orderBy: { startAt: "desc" }, take: 1 },
        },
      }),
      prisma.dealMeeting.findMany({
        where: {
          deal: organizationFilter,
        },
      }),
      prisma.dealStageHistory.findMany({
        where: {
          deal: organizationFilter,
        },
        orderBy: { changedAt: "asc" },
      }),
    ]);

    // ── Pipeline breakdown ──
    const stageMap = new Map<string, { count: number; totalAmount: number }>();
    for (const stage of Object.values(DealStage)) {
      stageMap.set(stage, { count: 0, totalAmount: 0 });
    }
    let totalValue = 0;
    let totalDeals = 0;
    for (const deal of allDeals) {
      const entry = stageMap.get(deal.stage)!;
      entry.count++;
      entry.totalAmount += deal.amount;
      if (OPEN_STAGES.includes(deal.stage as DealStage)) {
        totalValue += deal.amount;
        totalDeals++;
      }
    }
    const pipeline = {
      stages: Object.values(DealStage).map((stage) => ({
        stage,
        ...stageMap.get(stage)!,
      })),
      totalValue,
      totalDeals,
    };

    // ── Lead velocity ──
    const dealHistoryMap = new Map<string, Array<{ fromStage: DealStage | null; toStage: DealStage; changedAt: Date }>>();
    for (const h of allHistory) {
      if (!dealHistoryMap.has(h.dealId)) dealHistoryMap.set(h.dealId, []);
      dealHistoryMap.get(h.dealId)!.push({
        fromStage: h.fromStage as DealStage | null,
        toStage: h.toStage as DealStage,
        changedAt: h.changedAt,
      });
    }

    const stageDurations = new Map<string, number[]>();
    for (const stage of Object.values(DealStage)) stageDurations.set(stage, []);

    const dealTotalDays: number[] = [];
    const velocityByMonth = new Map<string, number[]>();

    for (const [, history] of dealHistoryMap) {
      if (history.length < 2) continue;
      const totalDays = daysBetween(history[0].changedAt, history[history.length - 1].changedAt);
      dealTotalDays.push(totalDays);

      const mk = monthKey(history[history.length - 1].changedAt);
      if (!velocityByMonth.has(mk)) velocityByMonth.set(mk, []);
      velocityByMonth.get(mk)!.push(totalDays);

      for (let i = 0; i < history.length - 1; i++) {
        const days = daysBetween(history[i].changedAt, history[i + 1].changedAt);
        stageDurations.get(history[i].toStage)?.push(days);
      }
    }

    const avgDaysPerStage: Record<string, number> = {};
    for (const [stage, durations] of stageDurations) {
      avgDaysPerStage[stage] = durations.length > 0
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0;
    }

    const avgTotalDays = dealTotalDays.length > 0
      ? Math.round(dealTotalDays.reduce((a, b) => a + b, 0) / dealTotalDays.length)
      : 0;

    const velocityTrend = [...velocityByMonth.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, days]) => ({
        month,
        avgDays: Math.round(days.reduce((a, b) => a + b, 0) / days.length),
      }));

    // ── Meetings ──
    const now = new Date();
    let completedMeetings = 0;
    let upcomingMeetings = 0;
    let totalExpected = 0;
    let totalActual = 0;
    const meetingsByMonth = new Map<string, number>();

    for (const m of allMeetings) {
      if (m.status === MeetingStatus.COMPLETED) completedMeetings++;
      if (m.status === MeetingStatus.SCHEDULED && m.startAt > now) upcomingMeetings++;
      totalExpected += m.expectedAttendees;
      totalActual += m.actualAttendees;

      const mk = monthKey(m.startAt);
      meetingsByMonth.set(mk, (meetingsByMonth.get(mk) || 0) + 1);
    }

    const meetings = {
      total: allMeetings.length,
      completed: completedMeetings,
      upcoming: upcomingMeetings,
      byMonth: [...meetingsByMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, count]) => ({ month, count })),
      avgAttendanceRate: totalExpected > 0 ? totalActual / totalExpected : 0,
    };

    // ── Close rate ──
    const wonDeals = allDeals.filter((d) => d.stage === DealStage.CLOSED_WON);
    const lostDeals = allDeals.filter((d) => d.stage === DealStage.CLOSED_LOST);
    const openDeals = allDeals.filter((d) => OPEN_STAGES.includes(d.stage as DealStage));
    const closedTotal = wonDeals.length + lostDeals.length;
    const closeRate = closedTotal > 0 ? wonDeals.length / closedTotal : 0;

    const closeByMonth = new Map<string, { won: number; lost: number }>();
    for (const d of [...wonDeals, ...lostDeals]) {
      const dateKey = d.closedAt ? monthKey(d.closedAt) : monthKey(d.updatedAt);
      if (!closeByMonth.has(dateKey)) closeByMonth.set(dateKey, { won: 0, lost: 0 });
      const entry = closeByMonth.get(dateKey)!;
      if (d.stage === DealStage.CLOSED_WON) entry.won++;
      else entry.lost++;
    }

    const closeRateData = {
      won: wonDeals.length,
      lost: lostDeals.length,
      open: openDeals.length,
      rate: closeRate,
      trend: [...closeByMonth.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([month, { won, lost }]) => ({
          month,
          won,
          lost,
          rate: won + lost > 0 ? won / (won + lost) : 0,
        })),
    };

    // ── Source attribution ──
    const sourceMap = new Map<string, { count: number; totalAmount: number; wonCount: number }>();
    for (const deal of allDeals) {
      const src = deal.source;
      if (!sourceMap.has(src)) sourceMap.set(src, { count: 0, totalAmount: 0, wonCount: 0 });
      const entry = sourceMap.get(src)!;
      entry.count++;
      entry.totalAmount += deal.amount;
      if (deal.stage === DealStage.CLOSED_WON) entry.wonCount++;
    }

    const sourceAttribution = [...sourceMap.entries()].map(([source, data]) => ({
      source,
      ...data,
    }));

    // ── Stale deals ──
    const staleThreshold = new Date(now.getTime() - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000);
    const staleDeals = allDeals
      .filter((d) => OPEN_STAGES.includes(d.stage as DealStage))
      .map((d) => {
        const lastMeeting = d.meetings[0]?.startAt ?? null;
        const lastActivity = lastMeeting
          ? new Date(Math.max(d.updatedAt.getTime(), lastMeeting.getTime()))
          : d.updatedAt;
        return {
          dealId: d.id,
          dealName: d.name,
          stage: d.stage,
          amount: d.amount,
          company: d.company?.name ?? null,
          daysSinceActivity: Math.round(daysBetween(lastActivity, now)),
          lastActivityAt: lastActivity.toISOString(),
        };
      })
      .filter((d) => new Date(d.lastActivityAt) < staleThreshold)
      .sort((a, b) => b.daysSinceActivity - a.daysSinceActivity);

    return NextResponse.json({
      pipeline,
      velocity: { avgDaysPerStage, avgTotalDays, trend: velocityTrend },
      meetings,
      closeRate: closeRateData,
      sourceAttribution,
      staleDeals,
    });
  } catch (error) {
    return toDealsErrorResponse(error, "Failed to compute analytics");
  }
}
