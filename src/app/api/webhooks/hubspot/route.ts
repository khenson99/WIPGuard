import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { DealStage } from "@prisma/client";
import { validateStageTransition } from "@/lib/deals/stage-transitions";

// HubSpot deal stage to internal DealStage mapping
const HUBSPOT_STAGE_MAP: Record<string, DealStage> = {
  appointmentscheduled: DealStage.LEAD,
  qualifiedtobuy: DealStage.QUALIFIED,
  presentationscheduled: DealStage.PROPOSAL,
  decisionmakerboughtin: DealStage.NEGOTIATION,
  contractsent: DealStage.NEGOTIATION,
  closedwon: DealStage.CLOSED_WON,
  closedlost: DealStage.CLOSED_LOST,
};

interface HubSpotWebhookEvent {
  subscriptionType: string;
  objectId: number;
  propertyName?: string;
  propertyValue?: string;
  eventId: number;
  occurredAt: number;
  portalId: number;
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("x-hubspot-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "Missing signature" },
      { status: 401 }
    );
  }

  // TODO: Verify HubSpot webhook signature

  const events: HubSpotWebhookEvent[] = await request.json();

  const results = [];

  for (const event of events) {
    try {
      if (
        event.subscriptionType === "deal.propertyChange" &&
        event.propertyName === "dealstage"
      ) {
        const result = await handleDealStageChange(event);
        results.push(result);
      } else if (event.subscriptionType === "deal.creation") {
        const result = await handleDealCreation(event);
        results.push(result);
      } else if (event.subscriptionType === "deal.deletion") {
        const result = await handleDealDeletion(event);
        results.push(result);
      }
    } catch (error) {
      console.error(
        `[HubSpot Webhook] Error processing event ${event.eventId}:`,
        error
      );
      results.push({
        eventId: event.eventId,
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ processed: results.length, results });
}

async function handleDealStageChange(event: HubSpotWebhookEvent) {
  const hubspotStageKey = event.propertyValue?.toLowerCase();
  if (!hubspotStageKey || !(hubspotStageKey in HUBSPOT_STAGE_MAP)) {
    return {
      eventId: event.eventId,
      status: "skipped",
      message: `Unknown HubSpot stage: ${event.propertyValue}`,
    };
  }

  const targetStage = HUBSPOT_STAGE_MAP[hubspotStageKey];

  // Find the deal linked to this HubSpot object
  const deal = await prisma.deal.findFirst({
    where: {
      hubspotDealId: String(event.objectId),
    },
  });

  if (!deal) {
    return {
      eventId: event.eventId,
      status: "skipped",
      message: `No matching deal found for HubSpot ID: ${event.objectId}`,
    };
  }

  // Validate the stage transition
  const transitionResult = validateStageTransition(deal.stage, targetStage);

  if (!transitionResult.valid) {
    console.warn(
      `[HubSpot Webhook] Invalid stage transition blocked for deal ${deal.id}: ` +
        `${deal.stage} -> ${targetStage} (HubSpot object ${event.objectId}). ` +
        `${transitionResult.message}`
    );

    return {
      eventId: event.eventId,
      status: "rejected",
      message: transitionResult.message,
      dealId: deal.id,
      currentStage: deal.stage,
      targetStage,
      allowedTransitions: transitionResult.allowedTransitions,
    };
  }

  const updatedDeal = await prisma.deal.update({
    where: { id: deal.id },
    data: { stage: targetStage },
  });

  return {
    eventId: event.eventId,
    status: "success",
    dealId: updatedDeal.id,
    previousStage: deal.stage,
    newStage: targetStage,
  };
}

async function handleDealCreation(event: HubSpotWebhookEvent) {
  // Deal creation from HubSpot - no stage transition validation needed
  // as new deals start at LEAD by default
  return {
    eventId: event.eventId,
    status: "acknowledged",
    message: "Deal creation webhook received",
  };
}

async function handleDealDeletion(event: HubSpotWebhookEvent) {
  const deal = await prisma.deal.findFirst({
    where: {
      hubspotDealId: String(event.objectId),
    },
  });

  if (!deal) {
    return {
      eventId: event.eventId,
      status: "skipped",
      message: `No matching deal found for HubSpot ID: ${event.objectId}`,
    };
  }

  await prisma.deal.delete({
    where: { id: deal.id },
  });

  return {
    eventId: event.eventId,
    status: "success",
    dealId: deal.id,
    message: "Deal deleted",
  };
}
