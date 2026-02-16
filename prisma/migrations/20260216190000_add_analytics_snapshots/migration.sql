-- CreateEnum
CREATE TYPE "AnalyticsSnapshotStatus" AS ENUM ('SUCCESS', 'ERROR');

-- CreateTable
CREATE TABLE "AnalyticsSnapshot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "contextKey" TEXT NOT NULL DEFAULT 'default',
    "rangePreset" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "payload" JSONB,
    "status" "AnalyticsSnapshotStatus" NOT NULL DEFAULT 'SUCCESS',
    "lastError" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_userId_providerKey_contextKey_rangePreset_toDate_idx" ON "AnalyticsSnapshot"("userId", "providerKey", "contextKey", "rangePreset", "toDate");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_expiresAt_idx" ON "AnalyticsSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "AnalyticsSnapshot_capturedAt_idx" ON "AnalyticsSnapshot"("capturedAt");

-- AddForeignKey
ALTER TABLE "AnalyticsSnapshot" ADD CONSTRAINT "AnalyticsSnapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
