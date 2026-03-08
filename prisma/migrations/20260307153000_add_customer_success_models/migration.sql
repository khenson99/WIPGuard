-- Customer Success foundation
-- Adds merged customer records plus dedicated CS persistence for notes,
-- plans, alerts, outreach, and account linkage from tasks/meetings.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerLifecycleStage" AS ENUM (
    'ONBOARDING',
    'ADOPTION',
    'ACTIVE',
    'EXPANSION',
    'RENEWAL',
    'AT_RISK',
    'CHURNED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerRecordStatus" AS ENUM ('ACTIVE', 'ARCHIVED', 'MERGED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerExternalProvider" AS ENUM (
    'INTERNAL',
    'HUBSPOT',
    'STRIPE',
    'PYLON',
    'CODA',
    'SLACK',
    'GOOGLE_WORKSPACE'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessNoteSource" AS ENUM (
    'MANUAL',
    'MEETING',
    'SUPPORT',
    'CRM',
    'AI',
    'SYSTEM'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessNoteVisibility" AS ENUM ('INTERNAL', 'RESTRICTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessPlanStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessMilestoneStatus" AS ENUM (
    'NOT_STARTED',
    'IN_PROGRESS',
    'BLOCKED',
    'COMPLETED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessAlertCategory" AS ENUM ('RISK', 'OPPORTUNITY', 'ACTION_REQUIRED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessAlertSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessAlertStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'DISMISSED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessSlaStatus" AS ENUM ('NONE', 'ON_TRACK', 'AT_RISK', 'BREACHED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessAlertSource" AS ENUM (
    'HEALTH',
    'SUPPORT',
    'COMMERCIAL',
    'RELATIONSHIP',
    'WORKFLOW'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessOutreachChannel" AS ENUM ('EMAIL', 'SLACK');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "CustomerSuccessOutreachStatus" AS ENUM (
    'DRAFT',
    'QUEUED',
    'SENT',
    'FAILED',
    'CANCELED'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable
ALTER TABLE "Task"
  ADD COLUMN IF NOT EXISTS "customerRecordId" TEXT;

-- AlterTable
ALTER TABLE "DealMeeting"
  ADD COLUMN IF NOT EXISTS "customerRecordId" TEXT;

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerRecord" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segment" TEXT,
    "tier" TEXT,
    "lifecycleStage" "CustomerLifecycleStage" NOT NULL DEFAULT 'ONBOARDING',
    "status" "CustomerRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "metadata" JSONB,
    "ownerId" TEXT,
    "dealCompanyId" TEXT,
    "primaryDealId" TEXT,
    "mergedIntoId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerRecordExternalRef" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "provider" "CustomerExternalProvider" NOT NULL,
    "externalObjectType" TEXT NOT NULL DEFAULT 'account',
    "externalId" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerRecordExternalRef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSuccessNote" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "source" "CustomerSuccessNoteSource" NOT NULL DEFAULT 'MANUAL',
    "visibility" "CustomerSuccessNoteVisibility" NOT NULL DEFAULT 'INTERNAL',
    "metadata" JSONB,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSuccessNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSuccessPlan" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "templateKey" TEXT,
    "status" "CustomerSuccessPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "ownerUserId" TEXT,
    "startedAt" TIMESTAMP(3),
    "targetDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSuccessPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSuccessPlanMilestone" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CustomerSuccessMilestoneStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "linkedTaskId" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSuccessPlanMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSuccessAlertRecord" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "alertKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "CustomerSuccessAlertCategory" NOT NULL,
    "severity" "CustomerSuccessAlertSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "CustomerSuccessAlertStatus" NOT NULL DEFAULT 'OPEN',
    "slaStatus" "CustomerSuccessSlaStatus" NOT NULL DEFAULT 'NONE',
    "source" "CustomerSuccessAlertSource" NOT NULL,
    "evidence" JSONB,
    "suggestedAction" TEXT,
    "ownerUserId" TEXT,
    "linkedTaskId" TEXT,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSuccessAlertRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "CustomerSuccessOutreachMessage" (
    "id" TEXT NOT NULL,
    "customerRecordId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "channel" "CustomerSuccessOutreachChannel" NOT NULL,
    "status" "CustomerSuccessOutreachStatus" NOT NULL DEFAULT 'DRAFT',
    "templateKey" TEXT,
    "recipientName" TEXT,
    "recipientAddress" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "providerMessageId" TEXT,
    "providerThreadId" TEXT,
    "queuedAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerSuccessOutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_customerRecordId_idx" ON "Task"("customerRecordId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealMeeting_customerRecordId_idx" ON "DealMeeting"("customerRecordId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRecord_dealCompanyId_key" ON "CustomerRecord"("dealCompanyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerRecord_organizationId_idx" ON "CustomerRecord"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerRecord_ownerId_idx" ON "CustomerRecord"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerRecord_mergedIntoId_idx" ON "CustomerRecord"("mergedIntoId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerRecord_status_lifecycleStage_idx" ON "CustomerRecord"("status", "lifecycleStage");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerRecordExternalRef_customerRecordId_provider_externalObjectType_externalId_key"
  ON "CustomerRecordExternalRef"("customerRecordId", "provider", "externalObjectType", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerRecordExternalRef_organizationId_idx" ON "CustomerRecordExternalRef"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerRecordExternalRef_provider_externalId_idx"
  ON "CustomerRecordExternalRef"("provider", "externalId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessNote_customerRecordId_createdAt_idx"
  ON "CustomerSuccessNote"("customerRecordId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessNote_organizationId_idx" ON "CustomerSuccessNote"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessNote_authorUserId_idx" ON "CustomerSuccessNote"("authorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessPlan_customerRecordId_status_idx"
  ON "CustomerSuccessPlan"("customerRecordId", "status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessPlan_organizationId_idx" ON "CustomerSuccessPlan"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessPlan_ownerUserId_idx" ON "CustomerSuccessPlan"("ownerUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessPlanMilestone_planId_sortOrder_idx"
  ON "CustomerSuccessPlanMilestone"("planId", "sortOrder");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessPlanMilestone_organizationId_idx"
  ON "CustomerSuccessPlanMilestone"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessPlanMilestone_linkedTaskId_idx"
  ON "CustomerSuccessPlanMilestone"("linkedTaskId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "CustomerSuccessAlertRecord_customerRecordId_alertKey_key"
  ON "CustomerSuccessAlertRecord"("customerRecordId", "alertKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessAlertRecord_organizationId_status_severity_idx"
  ON "CustomerSuccessAlertRecord"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessAlertRecord_ownerUserId_idx"
  ON "CustomerSuccessAlertRecord"("ownerUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessAlertRecord_linkedTaskId_idx"
  ON "CustomerSuccessAlertRecord"("linkedTaskId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessOutreachMessage_customerRecordId_status_createdAt_idx"
  ON "CustomerSuccessOutreachMessage"("customerRecordId", "status", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessOutreachMessage_organizationId_idx"
  ON "CustomerSuccessOutreachMessage"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessOutreachMessage_authorUserId_idx"
  ON "CustomerSuccessOutreachMessage"("authorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "CustomerSuccessOutreachMessage_providerMessageId_idx"
  ON "CustomerSuccessOutreachMessage"("providerMessageId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Task_customerRecordId_fkey') THEN
    ALTER TABLE "Task"
      ADD CONSTRAINT "Task_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealMeeting_customerRecordId_fkey') THEN
    ALTER TABLE "DealMeeting"
      ADD CONSTRAINT "DealMeeting_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecord_ownerId_fkey') THEN
    ALTER TABLE "CustomerRecord"
      ADD CONSTRAINT "CustomerRecord_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecord_dealCompanyId_fkey') THEN
    ALTER TABLE "CustomerRecord"
      ADD CONSTRAINT "CustomerRecord_dealCompanyId_fkey"
      FOREIGN KEY ("dealCompanyId") REFERENCES "DealCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecord_primaryDealId_fkey') THEN
    ALTER TABLE "CustomerRecord"
      ADD CONSTRAINT "CustomerRecord_primaryDealId_fkey"
      FOREIGN KEY ("primaryDealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecord_mergedIntoId_fkey') THEN
    ALTER TABLE "CustomerRecord"
      ADD CONSTRAINT "CustomerRecord_mergedIntoId_fkey"
      FOREIGN KEY ("mergedIntoId") REFERENCES "CustomerRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecord_organizationId_fkey') THEN
    ALTER TABLE "CustomerRecord"
      ADD CONSTRAINT "CustomerRecord_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecordExternalRef_customerRecordId_fkey') THEN
    ALTER TABLE "CustomerRecordExternalRef"
      ADD CONSTRAINT "CustomerRecordExternalRef_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerRecordExternalRef_organizationId_fkey') THEN
    ALTER TABLE "CustomerRecordExternalRef"
      ADD CONSTRAINT "CustomerRecordExternalRef_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessNote_customerRecordId_fkey') THEN
    ALTER TABLE "CustomerSuccessNote"
      ADD CONSTRAINT "CustomerSuccessNote_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessNote_authorUserId_fkey') THEN
    ALTER TABLE "CustomerSuccessNote"
      ADD CONSTRAINT "CustomerSuccessNote_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessNote_organizationId_fkey') THEN
    ALTER TABLE "CustomerSuccessNote"
      ADD CONSTRAINT "CustomerSuccessNote_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessPlan_customerRecordId_fkey') THEN
    ALTER TABLE "CustomerSuccessPlan"
      ADD CONSTRAINT "CustomerSuccessPlan_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessPlan_ownerUserId_fkey') THEN
    ALTER TABLE "CustomerSuccessPlan"
      ADD CONSTRAINT "CustomerSuccessPlan_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessPlan_organizationId_fkey') THEN
    ALTER TABLE "CustomerSuccessPlan"
      ADD CONSTRAINT "CustomerSuccessPlan_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessPlanMilestone_planId_fkey') THEN
    ALTER TABLE "CustomerSuccessPlanMilestone"
      ADD CONSTRAINT "CustomerSuccessPlanMilestone_planId_fkey"
      FOREIGN KEY ("planId") REFERENCES "CustomerSuccessPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessPlanMilestone_linkedTaskId_fkey') THEN
    ALTER TABLE "CustomerSuccessPlanMilestone"
      ADD CONSTRAINT "CustomerSuccessPlanMilestone_linkedTaskId_fkey"
      FOREIGN KEY ("linkedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessPlanMilestone_organizationId_fkey') THEN
    ALTER TABLE "CustomerSuccessPlanMilestone"
      ADD CONSTRAINT "CustomerSuccessPlanMilestone_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessAlertRecord_customerRecordId_fkey') THEN
    ALTER TABLE "CustomerSuccessAlertRecord"
      ADD CONSTRAINT "CustomerSuccessAlertRecord_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessAlertRecord_ownerUserId_fkey') THEN
    ALTER TABLE "CustomerSuccessAlertRecord"
      ADD CONSTRAINT "CustomerSuccessAlertRecord_ownerUserId_fkey"
      FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessAlertRecord_linkedTaskId_fkey') THEN
    ALTER TABLE "CustomerSuccessAlertRecord"
      ADD CONSTRAINT "CustomerSuccessAlertRecord_linkedTaskId_fkey"
      FOREIGN KEY ("linkedTaskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessAlertRecord_organizationId_fkey') THEN
    ALTER TABLE "CustomerSuccessAlertRecord"
      ADD CONSTRAINT "CustomerSuccessAlertRecord_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessOutreachMessage_customerRecordId_fkey') THEN
    ALTER TABLE "CustomerSuccessOutreachMessage"
      ADD CONSTRAINT "CustomerSuccessOutreachMessage_customerRecordId_fkey"
      FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessOutreachMessage_authorUserId_fkey') THEN
    ALTER TABLE "CustomerSuccessOutreachMessage"
      ADD CONSTRAINT "CustomerSuccessOutreachMessage_authorUserId_fkey"
      FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSuccessOutreachMessage_organizationId_fkey') THEN
    ALTER TABLE "CustomerSuccessOutreachMessage"
      ADD CONSTRAINT "CustomerSuccessOutreachMessage_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
