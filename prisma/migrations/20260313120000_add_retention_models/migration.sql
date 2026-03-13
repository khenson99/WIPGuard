CREATE TYPE "RetentionSourceKind" AS ENUM ('ARDA', 'CODA', 'STRIPE', 'HUBSPOT', 'PYLON');

CREATE TYPE "RetentionSyncRunStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'ERROR');

CREATE TYPE "RetentionLifecyclePhase" AS ENUM ('ONBOARDING', 'MATURE');

CREATE TYPE "RetentionTenantStatus" AS ENUM (
  'HEALTHY',
  'WATCH',
  'AT_RISK',
  'ONBOARDING_RISK',
  'BILLING_RISK'
);

CREATE TABLE "RetentionSyncRun" (
  "id" TEXT NOT NULL,
  "source" "RetentionSourceKind" NOT NULL,
  "status" "RetentionSyncRunStatus" NOT NULL DEFAULT 'SUCCESS',
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "windowStart" TIMESTAMP(3),
  "windowEnd" TIMESTAMP(3),
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "mappedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "notes" JSONB,
  "lastError" TEXT,
  "organizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionSourceRecord" (
  "id" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "source" "RetentionSourceKind" NOT NULL,
  "objectType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "tenantKey" TEXT,
  "occurredAt" TIMESTAMP(3),
  "sourceCreatedAt" TIMESTAMP(3),
  "sourceUpdatedAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "customerRecordId" TEXT,
  "organizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionSourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionTenantMonth" (
  "id" TEXT NOT NULL,
  "customerRecordId" TEXT NOT NULL,
  "monthStart" TIMESTAMP(3) NOT NULL,
  "monthEnd" TIMESTAMP(3) NOT NULL,
  "lifecyclePhase" "RetentionLifecyclePhase" NOT NULL,
  "status" "RetentionTenantStatus",
  "featureVersion" TEXT NOT NULL DEFAULT 'v1',
  "primaryLirPassed" BOOLEAN NOT NULL DEFAULT false,
  "primaryLirLabel" TEXT,
  "primaryLirValue" DOUBLE PRECISION,
  "primaryLirThreshold" DOUBLE PRECISION,
  "primaryLirScore" DOUBLE PRECISION,
  "reasonCodes" JSONB,
  "featureData" JSONB NOT NULL,
  "outcomeData" JSONB NOT NULL,
  "coverageData" JSONB,
  "organizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionTenantMonth_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RetentionTenantCurrent" (
  "id" TEXT NOT NULL,
  "customerRecordId" TEXT NOT NULL,
  "monthFactId" TEXT NOT NULL,
  "lifecyclePhase" "RetentionLifecyclePhase" NOT NULL,
  "status" "RetentionTenantStatus" NOT NULL,
  "primaryLirPassed" BOOLEAN NOT NULL DEFAULT false,
  "primaryLirLabel" TEXT NOT NULL,
  "primaryLirValue" DOUBLE PRECISION,
  "primaryLirThreshold" DOUBLE PRECISION,
  "currentMonthActivity" DOUBLE PRECISION,
  "activityTrendPct" DOUBLE PRECISION,
  "supportRisk" BOOLEAN NOT NULL DEFAULT false,
  "billingRisk" BOOLEAN NOT NULL DEFAULT false,
  "onboardingRisk" BOOLEAN NOT NULL DEFAULT false,
  "icp" BOOLEAN NOT NULL DEFAULT false,
  "ownerName" TEXT,
  "segment" TEXT,
  "plan" TEXT,
  "ageBucket" TEXT,
  "summaryData" JSONB NOT NULL,
  "detailData" JSONB NOT NULL,
  "reasonCodes" JSONB NOT NULL,
  "lastMaterializedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "organizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RetentionTenantCurrent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RetentionSourceRecord_source_objectType_externalId_key"
ON "RetentionSourceRecord"("source", "objectType", "externalId");

CREATE UNIQUE INDEX "RetentionTenantMonth_customerRecordId_monthStart_featureVersion_key"
ON "RetentionTenantMonth"("customerRecordId", "monthStart", "featureVersion");

CREATE UNIQUE INDEX "RetentionTenantCurrent_customerRecordId_key"
ON "RetentionTenantCurrent"("customerRecordId");

CREATE UNIQUE INDEX "RetentionTenantCurrent_monthFactId_key"
ON "RetentionTenantCurrent"("monthFactId");

CREATE INDEX "RetentionSyncRun_source_startedAt_idx"
ON "RetentionSyncRun"("source", "startedAt");

CREATE INDEX "RetentionSyncRun_organizationId_source_startedAt_idx"
ON "RetentionSyncRun"("organizationId", "source", "startedAt");

CREATE INDEX "RetentionSourceRecord_syncRunId_idx"
ON "RetentionSourceRecord"("syncRunId");

CREATE INDEX "RetentionSourceRecord_source_objectType_occurredAt_idx"
ON "RetentionSourceRecord"("source", "objectType", "occurredAt");

CREATE INDEX "RetentionSourceRecord_customerRecordId_occurredAt_idx"
ON "RetentionSourceRecord"("customerRecordId", "occurredAt");

CREATE INDEX "RetentionSourceRecord_organizationId_source_objectType_idx"
ON "RetentionSourceRecord"("organizationId", "source", "objectType");

CREATE INDEX "RetentionTenantMonth_organizationId_monthStart_idx"
ON "RetentionTenantMonth"("organizationId", "monthStart");

CREATE INDEX "RetentionTenantMonth_status_monthStart_idx"
ON "RetentionTenantMonth"("status", "monthStart");

CREATE INDEX "RetentionTenantMonth_customerRecordId_monthStart_idx"
ON "RetentionTenantMonth"("customerRecordId", "monthStart" DESC);

CREATE INDEX "RetentionTenantCurrent_organizationId_status_idx"
ON "RetentionTenantCurrent"("organizationId", "status");

CREATE INDEX "RetentionTenantCurrent_organizationId_lifecyclePhase_idx"
ON "RetentionTenantCurrent"("organizationId", "lifecyclePhase");

CREATE INDEX "RetentionTenantCurrent_organizationId_icp_idx"
ON "RetentionTenantCurrent"("organizationId", "icp");

ALTER TABLE "RetentionSyncRun"
ADD CONSTRAINT "RetentionSyncRun_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetentionSourceRecord"
ADD CONSTRAINT "RetentionSourceRecord_syncRunId_fkey"
FOREIGN KEY ("syncRunId") REFERENCES "RetentionSyncRun"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetentionSourceRecord"
ADD CONSTRAINT "RetentionSourceRecord_customerRecordId_fkey"
FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetentionSourceRecord"
ADD CONSTRAINT "RetentionSourceRecord_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetentionTenantMonth"
ADD CONSTRAINT "RetentionTenantMonth_customerRecordId_fkey"
FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetentionTenantMonth"
ADD CONSTRAINT "RetentionTenantMonth_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RetentionTenantCurrent"
ADD CONSTRAINT "RetentionTenantCurrent_customerRecordId_fkey"
FOREIGN KEY ("customerRecordId") REFERENCES "CustomerRecord"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetentionTenantCurrent"
ADD CONSTRAINT "RetentionTenantCurrent_monthFactId_fkey"
FOREIGN KEY ("monthFactId") REFERENCES "RetentionTenantMonth"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RetentionTenantCurrent"
ADD CONSTRAINT "RetentionTenantCurrent_organizationId_fkey"
FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
