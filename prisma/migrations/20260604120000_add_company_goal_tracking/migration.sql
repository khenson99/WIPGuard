-- CreateTable
CREATE TABLE "CompanyGoalTracking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "linearProjectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGoalTracking_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGoalTracking_userId_scopeKey_linearProjectId_key" ON "CompanyGoalTracking"("userId", "scopeKey", "linearProjectId");

-- CreateIndex
CREATE INDEX "CompanyGoalTracking_organizationId_scopeKey_idx" ON "CompanyGoalTracking"("organizationId", "scopeKey");

-- CreateIndex
CREATE INDEX "CompanyGoalTracking_userId_scopeKey_enabled_idx" ON "CompanyGoalTracking"("userId", "scopeKey", "enabled");

-- AddForeignKey
ALTER TABLE "CompanyGoalTracking" ADD CONSTRAINT "CompanyGoalTracking_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGoalTracking" ADD CONSTRAINT "CompanyGoalTracking_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
