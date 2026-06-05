ALTER TABLE "CeoReportRun"
  ADD COLUMN "boardFinalAt" TIMESTAMP(3),
  ADD COLUMN "boardFinalApprovedById" TEXT,
  ADD COLUMN "boardFinalOverrideReason" TEXT;

CREATE INDEX "CeoReportRun_packSlug_boardFinalAt_generatedAt_idx"
  ON "CeoReportRun"("packSlug", "boardFinalAt", "generatedAt" DESC);
