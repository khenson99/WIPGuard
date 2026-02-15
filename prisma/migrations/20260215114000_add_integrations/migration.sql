-- CreateEnum
CREATE TYPE "IntegrationProvider" AS ENUM ('GOOGLE_WORKSPACE', 'HUBSPOT', 'SLACK', 'CODA');

-- CreateEnum
CREATE TYPE "IntegrationConnectionStatus" AS ENUM ('CONNECTED', 'DISCONNECTED', 'ERROR');

-- CreateTable
CREATE TABLE "IntegrationConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "providerAccountId" TEXT,
    "accountLabel" TEXT,
    "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenType" TEXT,
    "expiresAt" TIMESTAMP(3),
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConnection_userId_provider_key" ON "IntegrationConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "IntegrationConnection_provider_status_idx" ON "IntegrationConnection"("provider", "status");

-- AddForeignKey
ALTER TABLE "IntegrationConnection" ADD CONSTRAINT "IntegrationConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
