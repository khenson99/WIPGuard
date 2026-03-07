-- Production reconciliation for schema drift caused by models that landed in
-- prisma/schema.prisma without matching migrations. This creates the missing
-- Deal CRM + SubmissionEvent tables, then backfills organizationId support for
-- tables that may have been created after the 202401 multi-tenant migration.

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "DealStage" AS ENUM ('LEAD', 'QUALIFIED', 'PROPOSAL', 'NEGOTIATION', 'CLOSED_WON', 'CLOSED_LOST');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "DealSource" AS ENUM ('ADS', 'WEBSITE', 'ORGANIC', 'REFERRAL', 'CONFERENCE', 'OUTBOUND', 'PARTNER', 'OTHER');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateEnum
DO $$
BEGIN
  CREATE TYPE "MeetingStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED', 'NO_SHOW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "DealCompany" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "notes" TEXT,
    "hubspotCompanyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DealContact" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "notes" TEXT,
    "companyId" TEXT,
    "hubspotContactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Deal" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "stage" "DealStage" NOT NULL DEFAULT 'LEAD',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "DealSource" NOT NULL DEFAULT 'OTHER',
    "expectedCloseDate" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "companyId" TEXT,
    "ownerId" TEXT,
    "hubspotDealId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Deal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DealStageHistory" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "fromStage" "DealStage",
    "toStage" "DealStage" NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changedBy" TEXT,

    CONSTRAINT "DealStageHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "DealMeeting" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "location" TEXT,
    "notes" TEXT,
    "expectedAttendees" INTEGER NOT NULL DEFAULT 0,
    "actualAttendees" INTEGER NOT NULL DEFAULT 0,
    "dealId" TEXT,
    "companyId" TEXT,
    "hubspotMeetingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DealMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubmissionEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "referenceId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "_DealContacts" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_DealContacts_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "_MeetingAttendees" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_MeetingAttendees_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DealCompany_hubspotCompanyId_key" ON "DealCompany"("hubspotCompanyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealCompany_name_idx" ON "DealCompany"("name");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DealContact_hubspotContactId_key" ON "DealContact"("hubspotContactId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealContact_companyId_idx" ON "DealContact"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealContact_email_idx" ON "DealContact"("email");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Deal_hubspotDealId_key" ON "Deal"("hubspotDealId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_stage_idx" ON "Deal"("stage");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_ownerId_idx" ON "Deal"("ownerId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_companyId_idx" ON "Deal"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_source_idx" ON "Deal"("source");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_closedAt_idx" ON "Deal"("closedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Deal_organizationId_idx" ON "Deal"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealStageHistory_dealId_changedAt_idx" ON "DealStageHistory"("dealId", "changedAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "DealMeeting_hubspotMeetingId_key" ON "DealMeeting"("hubspotMeetingId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealMeeting_dealId_idx" ON "DealMeeting"("dealId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealMeeting_companyId_idx" ON "DealMeeting"("companyId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealMeeting_startAt_idx" ON "DealMeeting"("startAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DealMeeting_status_idx" ON "DealMeeting"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubmissionEvent_createdAt_idx" ON "SubmissionEvent"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubmissionEvent_userId_idx" ON "SubmissionEvent"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubmissionEvent_type_createdAt_idx" ON "SubmissionEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_DealContacts_B_index" ON "_DealContacts"("B");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "_MeetingAttendees_B_index" ON "_MeetingAttendees"("B");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealContact_companyId_fkey') THEN
    ALTER TABLE "DealContact"
      ADD CONSTRAINT "DealContact_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "DealCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_companyId_fkey') THEN
    ALTER TABLE "Deal"
      ADD CONSTRAINT "Deal_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "DealCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_ownerId_fkey') THEN
    ALTER TABLE "Deal"
      ADD CONSTRAINT "Deal_ownerId_fkey"
      FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Deal_organizationId_fkey') THEN
    ALTER TABLE "Deal"
      ADD CONSTRAINT "Deal_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealStageHistory_dealId_fkey') THEN
    ALTER TABLE "DealStageHistory"
      ADD CONSTRAINT "DealStageHistory_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealMeeting_dealId_fkey') THEN
    ALTER TABLE "DealMeeting"
      ADD CONSTRAINT "DealMeeting_dealId_fkey"
      FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DealMeeting_companyId_fkey') THEN
    ALTER TABLE "DealMeeting"
      ADD CONSTRAINT "DealMeeting_companyId_fkey"
      FOREIGN KEY ("companyId") REFERENCES "DealCompany"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'SubmissionEvent_userId_fkey') THEN
    ALTER TABLE "SubmissionEvent"
      ADD CONSTRAINT "SubmissionEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_DealContacts_A_fkey') THEN
    ALTER TABLE "_DealContacts"
      ADD CONSTRAINT "_DealContacts_A_fkey"
      FOREIGN KEY ("A") REFERENCES "Deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_DealContacts_B_fkey') THEN
    ALTER TABLE "_DealContacts"
      ADD CONSTRAINT "_DealContacts_B_fkey"
      FOREIGN KEY ("B") REFERENCES "DealContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_MeetingAttendees_A_fkey') THEN
    ALTER TABLE "_MeetingAttendees"
      ADD CONSTRAINT "_MeetingAttendees_A_fkey"
      FOREIGN KEY ("A") REFERENCES "DealContact"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '_MeetingAttendees_B_fkey') THEN
    ALTER TABLE "_MeetingAttendees"
      ADD CONSTRAINT "_MeetingAttendees_B_fkey"
      FOREIGN KEY ("B") REFERENCES "DealMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Department" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- AlterTable
ALTER TABLE "IntegrationConnection" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- AlterTable
ALTER TABLE "Conference" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Department_organizationId_idx" ON "Department"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "IntegrationConnection_organizationId_idx" ON "IntegrationConnection"("organizationId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Conference_organizationId_idx" ON "Conference"("organizationId");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Department_organizationId_fkey') THEN
    ALTER TABLE "Department"
      ADD CONSTRAINT "Department_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'IntegrationConnection_organizationId_fkey') THEN
    ALTER TABLE "IntegrationConnection"
      ADD CONSTRAINT "IntegrationConnection_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Conference_organizationId_fkey') THEN
    ALTER TABLE "Conference"
      ADD CONSTRAINT "Conference_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
