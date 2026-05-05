-- CreateEnum
CREATE TYPE "CeoMetricUnit" AS ENUM ('COUNT', 'CURRENCY', 'DAYS', 'PERCENT', 'RATIO', 'SCORE', 'TEXT');

-- CreateEnum
CREATE TYPE "CeoMetricTrustStatus" AS ENUM ('FRESH', 'STALE', 'PARTIAL', 'MISSING', 'ERROR', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "CeoReportCadence" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'AD_HOC');

-- CreateEnum
CREATE TYPE "CeoReportAudience" AS ENUM ('CEO', 'BOARD', 'TEAM', 'INVESTOR');

-- CreateTable
CREATE TABLE "CeoMetricDefinition" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "ownerAudience" "CeoReportAudience" NOT NULL,
    "unit" "CeoMetricUnit" NOT NULL,
    "calculationVersion" TEXT NOT NULL,
    "sourceDependencies" TEXT[],
    "freshnessSlaHours" INTEGER NOT NULL,
    "boardEligible" BOOLEAN NOT NULL DEFAULT false,
    "weeklyEligible" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoMetricDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoMetricValueSnapshot" (
    "id" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "definitionId" TEXT,
    "userId" TEXT,
    "organizationId" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "value" JSONB NOT NULL,
    "priorValue" JSONB,
    "delta" DOUBLE PRECISION,
    "asOf" TIMESTAMP(3) NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL,
    "trustStatus" "CeoMetricTrustStatus" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "warnings" TEXT[],
    "sourceState" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoMetricValueSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoMetricSourceLineage" (
    "id" TEXT NOT NULL,
    "valueSnapshotId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "capturedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoMetricSourceLineage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoReportPack" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cadence" "CeoReportCadence" NOT NULL,
    "audience" "CeoReportAudience" NOT NULL,
    "metricKeys" TEXT[],
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "userId" TEXT,
    "organizationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CeoReportPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoReportSection" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "metricKeys" TEXT[],

    CONSTRAINT "CeoReportSection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CeoReportRun" (
    "id" TEXT NOT NULL,
    "packId" TEXT,
    "packSlug" TEXT NOT NULL,
    "packName" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metricPayload" JSONB NOT NULL,
    "deterministicNotes" TEXT[],
    "markdown" TEXT NOT NULL,
    "csv" TEXT NOT NULL,
    "slideJson" JSONB NOT NULL,
    "aiDraft" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CeoReportRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CeoMetricDefinition_key_key" ON "CeoMetricDefinition"("key");

-- CreateIndex
CREATE INDEX "CeoMetricDefinition_domain_idx" ON "CeoMetricDefinition"("domain");

-- CreateIndex
CREATE INDEX "CeoMetricDefinition_boardEligible_idx" ON "CeoMetricDefinition"("boardEligible");

-- CreateIndex
CREATE INDEX "CeoMetricDefinition_weeklyEligible_idx" ON "CeoMetricDefinition"("weeklyEligible");

-- CreateIndex
CREATE INDEX "CeoMetricValueSnapshot_metricKey_periodEnd_idx" ON "CeoMetricValueSnapshot"("metricKey", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "CeoMetricValueSnapshot_userId_periodEnd_idx" ON "CeoMetricValueSnapshot"("userId", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "CeoMetricValueSnapshot_organizationId_periodEnd_idx" ON "CeoMetricValueSnapshot"("organizationId", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "CeoMetricValueSnapshot_trustStatus_idx" ON "CeoMetricValueSnapshot"("trustStatus");

-- CreateIndex
CREATE INDEX "CeoMetricSourceLineage_valueSnapshotId_idx" ON "CeoMetricSourceLineage"("valueSnapshotId");

-- CreateIndex
CREATE INDEX "CeoMetricSourceLineage_sourceKey_capturedAt_idx" ON "CeoMetricSourceLineage"("sourceKey", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CeoReportPack_organizationId_userId_slug_key" ON "CeoReportPack"("organizationId", "userId", "slug");

-- CreateIndex
CREATE INDEX "CeoReportPack_isDefault_idx" ON "CeoReportPack"("isDefault");

-- CreateIndex
CREATE INDEX "CeoReportSection_packId_position_idx" ON "CeoReportSection"("packId", "position");

-- CreateIndex
CREATE INDEX "CeoReportRun_packSlug_generatedAt_idx" ON "CeoReportRun"("packSlug", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "CeoReportRun_userId_generatedAt_idx" ON "CeoReportRun"("userId", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "CeoReportRun_organizationId_generatedAt_idx" ON "CeoReportRun"("organizationId", "generatedAt" DESC);

-- AddForeignKey
ALTER TABLE "CeoMetricValueSnapshot" ADD CONSTRAINT "CeoMetricValueSnapshot_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CeoMetricDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoMetricValueSnapshot" ADD CONSTRAINT "CeoMetricValueSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoMetricValueSnapshot" ADD CONSTRAINT "CeoMetricValueSnapshot_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoMetricSourceLineage" ADD CONSTRAINT "CeoMetricSourceLineage_valueSnapshotId_fkey" FOREIGN KEY ("valueSnapshotId") REFERENCES "CeoMetricValueSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoReportPack" ADD CONSTRAINT "CeoReportPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoReportPack" ADD CONSTRAINT "CeoReportPack_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoReportSection" ADD CONSTRAINT "CeoReportSection_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CeoReportPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoReportRun" ADD CONSTRAINT "CeoReportRun_packId_fkey" FOREIGN KEY ("packId") REFERENCES "CeoReportPack"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoReportRun" ADD CONSTRAINT "CeoReportRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CeoReportRun" ADD CONSTRAINT "CeoReportRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
