CREATE TYPE "FunnelEventType" AS ENUM (
    'PAGE_VIEW',
    'SESSION_STARTED',
    'AUTH_COMPLETED',
    'DEMO_BOOKED',
    'KANBAN_CARD_CREATED',
    'TRIAL_STARTED',
    'PAID_CUSTOMER'
);

CREATE TYPE "FunnelIdentityType" AS ENUM (
    'EMAIL',
    'USER_ID',
    'HUBSPOT_CONTACT_ID',
    'HUBSPOT_DEAL_ID',
    'STRIPE_CUSTOMER_ID',
    'CODA_EMAIL'
);

CREATE TYPE "FunnelLinkProvenance" AS ENUM (
    'EXACT',
    'INFERRED',
    'BACKFILLED'
);

CREATE TYPE "EnrichmentProvider" AS ENUM (
    'UNIFY',
    'CLAY',
    'RB2B'
);

CREATE TABLE "FunnelVisitor" (
    "id" TEXT NOT NULL,
    "anonymousId" TEXT NOT NULL,
    "siteHost" TEXT,
    "firstTouchSource" TEXT,
    "firstTouchChannel" TEXT,
    "firstTouchCampaign" TEXT,
    "firstTouchReferrer" TEXT,
    "firstTouchLandingPath" TEXT,
    "firstTouchLandingUrl" TEXT,
    "lastTouchSource" TEXT,
    "lastTouchChannel" TEXT,
    "lastTouchCampaign" TEXT,
    "lastTouchReferrer" TEXT,
    "lastTouchPath" TEXT,
    "lastTouchUrl" TEXT,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelVisitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FunnelEvent" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "eventType" "FunnelEventType" NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "path" TEXT,
    "url" TEXT,
    "referrer" TEXT,
    "source" TEXT,
    "channel" TEXT,
    "campaign" TEXT,
    "dedupeKey" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FunnelIdentityLink" (
    "id" TEXT NOT NULL,
    "visitorId" TEXT NOT NULL,
    "identityType" "FunnelIdentityType" NOT NULL,
    "identityValue" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "provenance" "FunnelLinkProvenance" NOT NULL DEFAULT 'EXACT',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "metadata" JSONB,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelIdentityLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "FunnelEnrichmentSignal" (
    "id" TEXT NOT NULL,
    "provider" "EnrichmentProvider" NOT NULL,
    "signalKey" TEXT NOT NULL,
    "visitorId" TEXT,
    "anonymousId" TEXT,
    "email" TEXT,
    "domain" TEXT,
    "fullName" TEXT,
    "companyName" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "occurredAt" TIMESTAMP(3),
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FunnelEnrichmentSignal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FunnelVisitor_anonymousId_key" ON "FunnelVisitor"("anonymousId");
CREATE INDEX "FunnelVisitor_firstSeenAt_idx" ON "FunnelVisitor"("firstSeenAt");
CREATE INDEX "FunnelVisitor_lastSeenAt_idx" ON "FunnelVisitor"("lastSeenAt");
CREATE INDEX "FunnelVisitor_firstTouchChannel_firstSeenAt_idx" ON "FunnelVisitor"("firstTouchChannel", "firstSeenAt");
CREATE INDEX "FunnelVisitor_firstTouchSource_firstSeenAt_idx" ON "FunnelVisitor"("firstTouchSource", "firstSeenAt");
CREATE INDEX "FunnelVisitor_firstTouchCampaign_firstSeenAt_idx" ON "FunnelVisitor"("firstTouchCampaign", "firstSeenAt");
CREATE INDEX "FunnelVisitor_siteHost_firstSeenAt_idx" ON "FunnelVisitor"("siteHost", "firstSeenAt");

CREATE UNIQUE INDEX "FunnelEvent_dedupeKey_key" ON "FunnelEvent"("dedupeKey");
CREATE INDEX "FunnelEvent_visitorId_occurredAt_idx" ON "FunnelEvent"("visitorId", "occurredAt");
CREATE INDEX "FunnelEvent_eventType_occurredAt_idx" ON "FunnelEvent"("eventType", "occurredAt");
CREATE INDEX "FunnelEvent_channel_occurredAt_idx" ON "FunnelEvent"("channel", "occurredAt");

CREATE UNIQUE INDEX "FunnelIdentityLink_visitorId_identityType_identityValue_key" ON "FunnelIdentityLink"("visitorId", "identityType", "identityValue");
CREATE INDEX "FunnelIdentityLink_identityType_identityValue_idx" ON "FunnelIdentityLink"("identityType", "identityValue");
CREATE INDEX "FunnelIdentityLink_userId_idx" ON "FunnelIdentityLink"("userId");
CREATE INDEX "FunnelIdentityLink_provider_provenance_idx" ON "FunnelIdentityLink"("provider", "provenance");

CREATE UNIQUE INDEX "FunnelEnrichmentSignal_provider_signalKey_key" ON "FunnelEnrichmentSignal"("provider", "signalKey");
CREATE INDEX "FunnelEnrichmentSignal_visitorId_idx" ON "FunnelEnrichmentSignal"("visitorId");
CREATE INDEX "FunnelEnrichmentSignal_email_idx" ON "FunnelEnrichmentSignal"("email");
CREATE INDEX "FunnelEnrichmentSignal_domain_idx" ON "FunnelEnrichmentSignal"("domain");
CREATE INDEX "FunnelEnrichmentSignal_accepted_createdAt_idx" ON "FunnelEnrichmentSignal"("accepted", "createdAt");

ALTER TABLE "FunnelEvent"
ADD CONSTRAINT "FunnelEvent_visitorId_fkey"
FOREIGN KEY ("visitorId") REFERENCES "FunnelVisitor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FunnelIdentityLink"
ADD CONSTRAINT "FunnelIdentityLink_visitorId_fkey"
FOREIGN KEY ("visitorId") REFERENCES "FunnelVisitor"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "FunnelIdentityLink"
ADD CONSTRAINT "FunnelIdentityLink_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "FunnelEnrichmentSignal"
ADD CONSTRAINT "FunnelEnrichmentSignal_visitorId_fkey"
FOREIGN KEY ("visitorId") REFERENCES "FunnelVisitor"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
