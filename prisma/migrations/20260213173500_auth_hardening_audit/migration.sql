-- CreateTable
CREATE TABLE "SecurityAuditEvent" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "targetType" TEXT,
    "targetId" TEXT,
    "details" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SecurityAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_category_createdAt_idx" ON "SecurityAuditEvent"("category", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_action_createdAt_idx" ON "SecurityAuditEvent"("action", "createdAt");

-- CreateIndex
CREATE INDEX "SecurityAuditEvent_actorId_createdAt_idx" ON "SecurityAuditEvent"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "SecurityAuditEvent" ADD CONSTRAINT "SecurityAuditEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
