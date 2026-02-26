-- CreateEnum
CREATE TYPE "InsightFeedbackAction" AS ENUM ('USEFUL', 'NOT_USEFUL', 'ACTED_ON', 'DISMISSED');

-- CreateTable
CREATE TABLE "MetricHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "metricKey" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "rangePreset" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InsightFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "insightId" TEXT NOT NULL,
    "action" "InsightFeedbackAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsightFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MetricHistory_userId_metricKey_periodEnd_idx" ON "MetricHistory"("userId", "metricKey", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "MetricHistory_userId_section_periodEnd_idx" ON "MetricHistory"("userId", "section", "periodEnd" DESC);

-- CreateIndex
CREATE INDEX "MetricHistory_capturedAt_idx" ON "MetricHistory"("capturedAt");

-- CreateIndex
CREATE INDEX "InsightFeedback_userId_insightId_idx" ON "InsightFeedback"("userId", "insightId");

-- CreateIndex
CREATE INDEX "InsightFeedback_createdAt_idx" ON "InsightFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "MetricHistory" ADD CONSTRAINT "MetricHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InsightFeedback" ADD CONSTRAINT "InsightFeedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
