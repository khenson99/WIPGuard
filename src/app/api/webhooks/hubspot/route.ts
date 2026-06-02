import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { DealStage } from "@/generated/prisma/client";
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

const HUBSPOT_SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const HUBSPOT_URI_DECODE_REPLACEMENTS: readonly [RegExp, string][] = [
  [/%3A/gi, ":"],
  [/%2F/gi, "/"],
  [/%3F/gi, "?"],
  [/%40/gi, "@"],
  [/%21/gi, "!"],
  [/%24/gi, "$"],
  [/%27/gi, "'"],
  [/%28/gi, "("],
  [/%29/gi, ")"],
  [/%2A/gi, "*"],
  [/%2C/gi, ","],
  [/%3B/gi, ";"],
];

function decodeHubSpotSignatureUri(uri: string): string {
  return HUBSPOT_URI_DECODE_REPLACEMENTS.reduce(
    (decoded, [pattern, replacement]) => decoded.replace(pattern, replacement),
    uri,
  );
}

function timingSafeStringEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  if (actualBuffer.length !== expectedBuffer.length) {
    timingSafeEqual(expectedBuffer, expectedBuffer);
    return false;
  }

  return timingSafeEqual(actualBuffer, expectedBuffer);
}

function verifyHubSpotSignatureV3(input: {
  method: string;
  url: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
}): boolean {
  const secret = process.env.HUBSPOT_CLIENT_SECRET?.trim();
  if (!secret || !input.timestamp || !input.signature) {
    return false;
  }

  const timestampMs = Number(input.timestamp);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }

  if (Math.abs(Date.now() - timestampMs) > HUBSPOT_SIGNATURE_MAX_AGE_MS) {
    return false;
  }

  const source = `${input.method.toUpperCase()}${decodeHubSpotSignatureUri(input.url)}${input.body}${input.timestamp}`;
  const expected = createHmac("sha256", secret).update(source, "utf8").digest("base64");
  return timingSafeStringEqual(input.signature, expected);
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-hubspot-signature-v3");
  const timestamp = request.headers.get("x-hubspot-request-timestamp");

  if (
    !verifyHubSpotSignatureV3({
      method: request.method,
      url: request.url,
      body: rawBody,
      timestamp,
      signature,
    })
  ) {
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  const events = JSON.parse(rawBody) as HubSpotWebhookEvent[];

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
