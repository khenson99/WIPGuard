CREATE TYPE "ImladrisSyncStatus" AS ENUM ('SUCCESS', 'PARTIAL', 'ERROR');
CREATE TYPE "ImladrisMetricStatus" AS ENUM ('READY', 'STALE', 'MISSING', 'ERROR');

CREATE TABLE "ImladrisSourceSyncRun" (
  "id" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "status" "ImladrisSyncStatus" NOT NULL DEFAULT 'SUCCESS',
  "mode" TEXT NOT NULL DEFAULT 'incremental',
  "windowStart" TIMESTAMP(3),
  "windowEnd" TIMESTAMP(3),
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "recordCount" INTEGER NOT NULL DEFAULT 0,
  "acceptedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "checkpoint" JSONB,
  "lastError" TEXT,
  "userId" TEXT,
  "organizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImladrisSourceSyncRun_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImladrisRawSourceRecord" (
  "id" TEXT NOT NULL,
  "syncRunId" TEXT NOT NULL,
  "provider" "IntegrationProvider" NOT NULL,
  "objectType" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "scopeKey" TEXT NOT NULL,
  "sourceCreatedAt" TIMESTAMP(3),
  "sourceUpdatedAt" TIMESTAMP(3),
  "occurredAt" TIMESTAMP(3),
  "payload" JSONB NOT NULL,
  "payloadHash" TEXT NOT NULL,
  "userId" TEXT,
  "organizationId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImladrisRawSourceRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImladrisCanonicalMetricValue" (
  "id" TEXT NOT NULL,
  "metricKey" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "periodStart" TIMESTAMP(3) NOT NULL,
  "periodEnd" TIMESTAMP(3) NOT NULL,
  "status" "ImladrisMetricStatus" NOT NULL DEFAULT 'MISSING',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "warnings" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "calculationVersion" TEXT NOT NULL,
  "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "userId" TEXT,
  "organizationId" TEXT,
  CONSTRAINT "ImladrisCanonicalMetricValue_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImladrisMetricLineage" (
  "id" TEXT NOT NULL,
  "metricValueId" TEXT NOT NULL,
  "rawRecordId" TEXT,
  "sourceKey" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT,
  "capturedAt" TIMESTAMP(3),
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImladrisMetricLineage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ImladrisSourceSyncRun_provider_startedAt_idx" ON "ImladrisSourceSyncRun"("provider", "startedAt");
CREATE INDEX "ImladrisSourceSyncRun_organizationId_provider_startedAt_idx" ON "ImladrisSourceSyncRun"("organizationId", "provider", "startedAt");
CREATE INDEX "ImladrisSourceSyncRun_userId_provider_startedAt_idx" ON "ImladrisSourceSyncRun"("userId", "provider", "startedAt");

CREATE UNIQUE INDEX "ImladrisRawSourceRecord_provider_objectType_externalId_scopeKey_key" ON "ImladrisRawSourceRecord"("provider", "objectType", "externalId", "scopeKey");
CREATE INDEX "ImladrisRawSourceRecord_syncRunId_idx" ON "ImladrisRawSourceRecord"("syncRunId");
CREATE INDEX "ImladrisRawSourceRecord_provider_objectType_occurredAt_idx" ON "ImladrisRawSourceRecord"("provider", "objectType", "occurredAt");
CREATE INDEX "ImladrisRawSourceRecord_scopeKey_provider_objectType_idx" ON "ImladrisRawSourceRecord"("scopeKey", "provider", "objectType");
CREATE INDEX "ImladrisRawSourceRecord_organizationId_provider_objectType_idx" ON "ImladrisRawSourceRecord"("organizationId", "provider", "objectType");

CREATE UNIQUE INDEX "ImladrisCanonicalMetricValue_organizationId_userId_metricKey_periodEnd_calculationVersion_key" ON "ImladrisCanonicalMetricValue"("organizationId", "userId", "metricKey", "periodEnd", "calculationVersion");
CREATE INDEX "ImladrisCanonicalMetricValue_metricKey_periodEnd_idx" ON "ImladrisCanonicalMetricValue"("metricKey", "periodEnd" DESC);
CREATE INDEX "ImladrisCanonicalMetricValue_organizationId_department_periodEnd_idx" ON "ImladrisCanonicalMetricValue"("organizationId", "department", "periodEnd" DESC);
CREATE INDEX "ImladrisCanonicalMetricValue_userId_department_periodEnd_idx" ON "ImladrisCanonicalMetricValue"("userId", "department", "periodEnd" DESC);
CREATE INDEX "ImladrisCanonicalMetricValue_status_idx" ON "ImladrisCanonicalMetricValue"("status");

CREATE INDEX "ImladrisMetricLineage_metricValueId_idx" ON "ImladrisMetricLineage"("metricValueId");
CREATE INDEX "ImladrisMetricLineage_rawRecordId_idx" ON "ImladrisMetricLineage"("rawRecordId");
CREATE INDEX "ImladrisMetricLineage_sourceKey_capturedAt_idx" ON "ImladrisMetricLineage"("sourceKey", "capturedAt");

ALTER TABLE "ImladrisRawSourceRecord"
  ADD CONSTRAINT "ImladrisRawSourceRecord_syncRunId_fkey"
  FOREIGN KEY ("syncRunId") REFERENCES "ImladrisSourceSyncRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImladrisMetricLineage"
  ADD CONSTRAINT "ImladrisMetricLineage_metricValueId_fkey"
  FOREIGN KEY ("metricValueId") REFERENCES "ImladrisCanonicalMetricValue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImladrisMetricLineage"
  ADD CONSTRAINT "ImladrisMetricLineage_rawRecordId_fkey"
  FOREIGN KEY ("rawRecordId") REFERENCES "ImladrisRawSourceRecord"("id") ON DELETE SET NULL ON UPDATE CASCADE;
