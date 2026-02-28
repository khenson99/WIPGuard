-- CreateEnum
CREATE TYPE "ProspectStatus" AS ENUM ('DISCOVERED', 'VERIFIED', 'PUSHED', 'REJECTED', 'ERROR');

-- CreateTable
CREATE TABLE "ManufacturerProspect" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "domain" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "employeeCount" INTEGER,
    "kanbanEvidence" JSONB NOT NULL,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactTitle" TEXT,
    "sourceType" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "status" "ProspectStatus" NOT NULL DEFAULT 'DISCOVERED',
    "hubspotCompanyId" TEXT,
    "hubspotContactId" TEXT,
    "pushedToHubspotAt" TIMESTAMP(3),
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "ManufacturerProspect_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturerProspect_userId_domain_key" ON "ManufacturerProspect"("userId", "domain");

-- CreateIndex
CREATE INDEX "ManufacturerProspect_userId_status_idx" ON "ManufacturerProspect"("userId", "status");

-- CreateIndex
CREATE INDEX "ManufacturerProspect_discoveredAt_idx" ON "ManufacturerProspect"("discoveredAt");
