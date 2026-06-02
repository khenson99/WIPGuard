import {
  IntegrationProvider,
  DealStage,
  DealSource,
  MeetingStatus,
} from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { getValidIntegrationAccessToken } from "@/lib/integrations/token-refresh";

const HUBSPOT_BASE = "https://api.hubapi.com";
const HUBSPOT_MAIN_PIPELINE_ID = "default";

// ── Stage & source mapping ──────────────────────────────────

const HUBSPOT_STAGE_TO_DEAL: Record<string, DealStage> = {
  appointmentscheduled: DealStage.LEAD,
  "1499838171": DealStage.LEAD, // Approached
  qualifiedtobuy: DealStage.LEAD,
  presentationscheduled: DealStage.QUALIFIED,
  "1955958510": DealStage.QUALIFIED, // No-Show/Reschedule Demo
  decisionmakerboughtin: DealStage.QUALIFIED,
  "1955580622": DealStage.PROPOSAL, // Budgetary quote sent
  "1559099077": DealStage.PROPOSAL, // Payment Link Sent
  "1499827945": DealStage.NEGOTIATION, // Free Trial
  "1731122907": DealStage.NEGOTIATION, // Freemium
  contractsent: DealStage.NEGOTIATION, // Ping Later
  closedwon: DealStage.CLOSED_WON,
  closedlost: DealStage.CLOSED_LOST,
  "1499784890": DealStage.CLOSED_LOST, // Churn
  "1499784891": DealStage.CLOSED_LOST, // Unlikely
  "1499827944": DealStage.NEGOTIATION, // On Hold
  "1718686448": DealStage.NEGOTIATION, // Internal+Friends and Family
  "2025131723": DealStage.NEGOTIATION, // Interested in a pilot
};

const HUBSPOT_SOURCE_TO_DEAL: Record<string, DealSource> = {
  PAID_SEARCH: DealSource.ADS,
  PAID_SOCIAL: DealSource.ADS,
  ORGANIC_SEARCH: DealSource.ORGANIC,
  ORGANIC_SOCIAL: DealSource.ORGANIC,
  DIRECT_TRAFFIC: DealSource.WEBSITE,
  REFERRALS: DealSource.REFERRAL,
  OFFLINE_SOURCES: DealSource.CONFERENCE,
  OTHER_CAMPAIGNS: DealSource.OUTBOUND,
  EMAIL_MARKETING: DealSource.OUTBOUND,
};

export function mapHubSpotStageToDealStage(hubspotStage: string): DealStage {
  return HUBSPOT_STAGE_TO_DEAL[hubspotStage] ?? DealStage.LEAD;
}

function mapSource(hubspotSource: string | undefined): DealSource {
  if (!hubspotSource) return DealSource.OTHER;
  return HUBSPOT_SOURCE_TO_DEAL[hubspotSource] ?? DealSource.OTHER;
}

// ── Auth ─────────────────────────────────────────────────────

async function getHubSpotAuth(userId: string): Promise<{ accessToken: string }> {
  const accessToken = await getValidIntegrationAccessToken({
    userId,
    provider: IntegrationProvider.HUBSPOT,
  });
  return { accessToken };
}

// ── HubSpot API helpers ──────────────────────────────────────

interface HubSpotResult {
  id: string;
  properties: Record<string, string>;
}

async function hubspotGet<T>(accessToken: string, url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "unknown");
    throw new Error(`HubSpot API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function fetchAllPaginated(
  accessToken: string,
  objectType: string,
  properties: string,
  maxPages = 100,
): Promise<HubSpotResult[]> {
  const all: HubSpotResult[] = [];
  let after: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const url = new URL(`${HUBSPOT_BASE}/crm/v3/objects/${objectType}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("properties", properties);
    if (after) url.searchParams.set("after", after);

    const data = await hubspotGet<{ results: HubSpotResult[]; paging?: { next?: { after: string } } }>(
      accessToken,
      url.toString(),
    );
    all.push(...(data.results || []));
    after = data.paging?.next?.after;
    if (!after || (data.results || []).length === 0) break;
  }

  return all;
}

async function fetchAssociations(
  accessToken: string,
  fromType: string,
  fromId: string,
  toType: string,
): Promise<string[]> {
  try {
    const url = `${HUBSPOT_BASE}/crm/v3/objects/${fromType}/${encodeURIComponent(fromId)}/associations/${toType}`;
    const data = await hubspotGet<{ results?: Array<{ id: string }> }>(accessToken, url);
    return (data.results || []).map((r) => r.id);
  } catch {
    return [];
  }
}

async function fetchOwnerMap(accessToken: string): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const data = await hubspotGet<{ results: Array<{ id: string; firstName?: string; lastName?: string; email?: string }> }>(
      accessToken,
      `${HUBSPOT_BASE}/crm/v3/owners?limit=100`,
    );
    for (const owner of data.results || []) {
      map[owner.id] =
        owner.firstName && owner.lastName
          ? `${owner.firstName} ${owner.lastName}`
          : owner.email || "Unknown";
    }
  } catch {
    // Non-critical
  }
  return map;
}

// ── Main sync function ───────────────────────────────────────

export interface SyncResult {
  companies: number;
  contacts: number;
  deals: number;
  meetings: number;
}

export async function syncDealsFromHubSpot(userId: string): Promise<SyncResult> {
  const { accessToken } = await getHubSpotAuth(userId);
  const result: SyncResult = { companies: 0, contacts: 0, deals: 0, meetings: 0 };

  // 1. Fetch all entities from HubSpot
  const [hsDeals, hsContacts, hsCompanies, hsMeetings, ownerMap] = await Promise.all([
    fetchAllPaginated(accessToken, "deals", "dealname,dealstage,amount,closedate,createdate,hs_analytics_source,hubspot_owner_id,hs_lastmodifieddate,pipeline"),
    fetchAllPaginated(accessToken, "contacts", "firstname,lastname,email,phone,jobtitle"),
    fetchAllPaginated(accessToken, "companies", "name,domain,industry"),
    fetchAllPaginated(accessToken, "meetings", "hs_meeting_title,hs_meeting_body,hs_meeting_start_time,hs_meeting_end_time,hs_meeting_location,hs_meeting_outcome,hs_meeting_external_url"),
    fetchOwnerMap(accessToken),
  ]);

  // 2. Upsert companies
  const companyHsIdToLocal = new Map<string, string>();
  for (const hc of hsCompanies) {
    const name = hc.properties.name?.trim();
    if (!name) continue;

    const company = await prisma.dealCompany.upsert({
      where: { hubspotCompanyId: hc.id },
      create: {
        name,
        domain: hc.properties.domain || null,
        industry: hc.properties.industry || null,
        hubspotCompanyId: hc.id,
      },
      update: {
        name,
        domain: hc.properties.domain || null,
        industry: hc.properties.industry || null,
      },
    });
    companyHsIdToLocal.set(hc.id, company.id);
    result.companies++;
  }

  // 3. Upsert contacts (with company association)
  const contactHsIdToLocal = new Map<string, string>();
  for (const hct of hsContacts) {
    const firstName = hct.properties.firstname?.trim() || "";
    const lastName = hct.properties.lastname?.trim() || "";
    if (!firstName && !lastName) continue;

    // Find company association
    const companyIds = await fetchAssociations(accessToken, "contacts", hct.id, "companies");
    const localCompanyId = companyIds.length > 0 ? companyHsIdToLocal.get(companyIds[0]) ?? null : null;

    const contact = await prisma.dealContact.upsert({
      where: { hubspotContactId: hct.id },
      create: {
        firstName: firstName || "Unknown",
        lastName: lastName || "Unknown",
        email: hct.properties.email || null,
        phone: hct.properties.phone || null,
        title: hct.properties.jobtitle || null,
        companyId: localCompanyId,
        hubspotContactId: hct.id,
      },
      update: {
        firstName: firstName || "Unknown",
        lastName: lastName || "Unknown",
        email: hct.properties.email || null,
        phone: hct.properties.phone || null,
        title: hct.properties.jobtitle || null,
        companyId: localCompanyId,
      },
    });
    contactHsIdToLocal.set(hct.id, contact.id);
    result.contacts++;
  }

  // 4. Resolve owners to User IDs (match by name or email)
  const ownerToUserId = new Map<string, string>();
  const teamUsers = await prisma.user.findMany({ select: { id: true, name: true, email: true } });
  for (const [ownerId, ownerName] of Object.entries(ownerMap)) {
    const match = teamUsers.find(
      (u) =>
        (u.name && u.name.toLowerCase() === ownerName.toLowerCase()) ||
        u.email.toLowerCase() === ownerName.toLowerCase(),
    );
    if (match) ownerToUserId.set(ownerId, match.id);
  }

  // 5. Upsert deals (with company + contact associations)
  for (const hd of hsDeals) {
    const pipelineId = hd.properties.pipeline?.trim() || null;
    if (pipelineId && pipelineId !== HUBSPOT_MAIN_PIPELINE_ID) continue;

    const name = hd.properties.dealname?.trim();
    if (!name) continue;

    const stage = mapHubSpotStageToDealStage(hd.properties.dealstage || "");
    const source = mapSource(hd.properties.hs_analytics_source);
    const amount = parseFloat(hd.properties.amount) || 0;
    const closeDate = hd.properties.closedate ? new Date(hd.properties.closedate) : null;
    const closedAt =
      (stage === DealStage.CLOSED_WON || stage === DealStage.CLOSED_LOST) && closeDate
        ? closeDate
        : null;

    // Find associated company and contacts
    const [dealCompanyIds, dealContactIds] = await Promise.all([
      fetchAssociations(accessToken, "deals", hd.id, "companies"),
      fetchAssociations(accessToken, "deals", hd.id, "contacts"),
    ]);

    const localCompanyId = dealCompanyIds.length > 0 ? companyHsIdToLocal.get(dealCompanyIds[0]) ?? null : null;
    const localContactIds = dealContactIds
      .map((cid) => contactHsIdToLocal.get(cid))
      .filter((id): id is string => !!id);

    const ownerId = hd.properties.hubspot_owner_id
      ? ownerToUserId.get(hd.properties.hubspot_owner_id) ?? null
      : null;

    // Check if deal exists for stage history tracking
    const existing = await prisma.deal.findUnique({
      where: { hubspotDealId: hd.id },
      select: { id: true, stage: true },
    });

    const deal = await prisma.deal.upsert({
      where: { hubspotDealId: hd.id },
      create: {
        name,
        stage,
        amount,
        source,
        expectedCloseDate: closeDate,
        closedAt,
        ownerId,
        companyId: localCompanyId,
        hubspotDealId: hd.id,
        contacts: localContactIds.length > 0 ? { connect: localContactIds.map((id) => ({ id })) } : undefined,
      },
      update: {
        name,
        stage,
        amount,
        source,
        expectedCloseDate: closeDate,
        closedAt,
        ownerId,
        companyId: localCompanyId,
        contacts: { set: localContactIds.map((id) => ({ id })) },
      },
    });

    // Record stage history if stage changed or is new
    if (!existing) {
      await prisma.dealStageHistory.create({
        data: { dealId: deal.id, fromStage: null, toStage: stage },
      });
    } else if (existing.stage !== stage) {
      await prisma.dealStageHistory.create({
        data: { dealId: deal.id, fromStage: existing.stage, toStage: stage },
      });
    }

    result.deals++;
  }

  // 6. Upsert meetings (with deal + company + contact associations)
  for (const hm of hsMeetings) {
    const title = hm.properties.hs_meeting_title?.trim() || "Meeting";
    const startTime = hm.properties.hs_meeting_start_time;
    if (!startTime) continue;

    const startAt = new Date(startTime);
    if (isNaN(startAt.getTime())) continue;

    const endTime = hm.properties.hs_meeting_end_time;
    const endAt = endTime ? new Date(endTime) : null;

    const outcome = hm.properties.hs_meeting_outcome || "";
    const notes = hm.properties.hs_meeting_body?.trim() || null;
    let status: MeetingStatus = MeetingStatus.SCHEDULED;
    if (outcome === "COMPLETED") status = MeetingStatus.COMPLETED;
    else if (outcome === "CANCELED" || outcome === "CANCELLED") status = MeetingStatus.CANCELED;
    else if (outcome === "NO_SHOW" || outcome === "NOSHOW") status = MeetingStatus.NO_SHOW;
    else if (startAt < new Date()) status = MeetingStatus.COMPLETED;

    // Fetch associations for this meeting
    const [meetingDealIds, meetingContactIds, meetingCompanyIds] = await Promise.all([
      fetchAssociations(accessToken, "meetings", hm.id, "deals"),
      fetchAssociations(accessToken, "meetings", hm.id, "contacts"),
      fetchAssociations(accessToken, "meetings", hm.id, "companies"),
    ]);

    // Resolve to local IDs — for deal, find the first one we've synced
    let localDealId: string | null = null;
    for (const did of meetingDealIds) {
      const deal = await prisma.deal.findUnique({ where: { hubspotDealId: did }, select: { id: true } });
      if (deal) { localDealId = deal.id; break; }
    }

    const localCompanyId = meetingCompanyIds.length > 0 ? companyHsIdToLocal.get(meetingCompanyIds[0]) ?? null : null;
    const localAttendeeIds = meetingContactIds
      .map((cid) => contactHsIdToLocal.get(cid))
      .filter((id): id is string => !!id);

    await prisma.dealMeeting.upsert({
      where: { hubspotMeetingId: hm.id },
      create: {
        title,
        status,
        startAt,
        endAt: endAt && !isNaN(endAt.getTime()) ? endAt : null,
        location: hm.properties.hs_meeting_location || null,
        notes,
        dealId: localDealId,
        companyId: localCompanyId,
        expectedAttendees: localAttendeeIds.length,
        actualAttendees: status === MeetingStatus.COMPLETED ? localAttendeeIds.length : 0,
        hubspotMeetingId: hm.id,
        attendees: localAttendeeIds.length > 0 ? { connect: localAttendeeIds.map((id) => ({ id })) } : undefined,
      },
      update: {
        title,
        status,
        startAt,
        endAt: endAt && !isNaN(endAt.getTime()) ? endAt : null,
        location: hm.properties.hs_meeting_location || null,
        notes,
        dealId: localDealId,
        companyId: localCompanyId,
        expectedAttendees: localAttendeeIds.length,
        actualAttendees: status === MeetingStatus.COMPLETED ? localAttendeeIds.length : 0,
        attendees: { set: localAttendeeIds.map((id) => ({ id })) },
      },
    });

    result.meetings++;
  }

  return result;
}
