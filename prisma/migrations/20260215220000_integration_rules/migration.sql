-- AlterTable
ALTER TABLE "Task" ADD COLUMN "metadata" JSONB;

-- CreateTable
CREATE TABLE "IntegrationRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "statusOverride" "TaskStatus",
    "config" JSONB NOT NULL,
    "checkpoint" JSONB,
    "lastObservedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationReceipt" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "externalObjectType" TEXT NOT NULL,
    "externalObjectId" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "taskId" TEXT,
    "lastObservedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationRule_userId_provider_key_key" ON "IntegrationRule"("userId", "provider", "key");

-- CreateIndex
CREATE INDEX "IntegrationRule_provider_key_enabled_idx" ON "IntegrationRule"("provider", "key", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationReceipt_dedupeKey_key" ON "IntegrationReceipt"("dedupeKey");

-- CreateIndex
CREATE INDEX "IntegrationReceipt_ruleId_lastObservedAt_idx" ON "IntegrationReceipt"("ruleId", "lastObservedAt");

-- CreateIndex
CREATE INDEX "IntegrationReceipt_taskId_idx" ON "IntegrationReceipt"("taskId");

-- AddForeignKey
ALTER TABLE "IntegrationRule" ADD CONSTRAINT "IntegrationRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationReceipt" ADD CONSTRAINT "IntegrationReceipt_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "IntegrationRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationReceipt" ADD CONSTRAINT "IntegrationReceipt_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
