-- CreateTable
CREATE TABLE "IntegrationCircuitState" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "openedAt" TIMESTAMP(3),
    "currentCooldownMs" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationCircuitState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationCircuitState_userId_key_key" ON "IntegrationCircuitState"("userId", "key");

-- CreateIndex
CREATE INDEX "IntegrationCircuitState_updatedAt_idx" ON "IntegrationCircuitState"("updatedAt");

-- AddForeignKey
ALTER TABLE "IntegrationCircuitState" ADD CONSTRAINT "IntegrationCircuitState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

