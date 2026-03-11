ALTER TABLE "DealMeeting"
  ADD COLUMN IF NOT EXISTS "googleDriveFileId" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveFileName" TEXT,
  ADD COLUMN IF NOT EXISTS "googleDriveFileUrl" TEXT,
  ADD COLUMN IF NOT EXISTS "transcriptMatchedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "transcriptMatchConfidence" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "analysisArtifactId" TEXT,
  ADD COLUMN IF NOT EXISTS "demoQualityScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "demoQualitySummary" TEXT,
  ADD COLUMN IF NOT EXISTS "demoStrengthsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "demoGapsJson" JSONB,
  ADD COLUMN IF NOT EXISTS "analyzedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX IF NOT EXISTS "DealMeeting_analysisArtifactId_key"
  ON "DealMeeting"("analysisArtifactId");

CREATE INDEX IF NOT EXISTS "DealMeeting_googleDriveFileId_idx"
  ON "DealMeeting"("googleDriveFileId");

CREATE INDEX IF NOT EXISTS "DealMeeting_analyzedAt_idx"
  ON "DealMeeting"("analyzedAt");

DO $$
BEGIN
  ALTER TABLE "DealMeeting"
    ADD CONSTRAINT "DealMeeting_analysisArtifactId_fkey"
    FOREIGN KEY ("analysisArtifactId") REFERENCES "AutomationArtifact"("id")
    ON DELETE SET NULL
    ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
