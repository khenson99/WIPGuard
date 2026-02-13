-- CreateEnum
CREATE TYPE "EnforcementMode" AS ENUM ('WARN', 'BLOCK');

-- CreateTable
CREATE TABLE "WipPolicy" (
    "id" TEXT NOT NULL,
    "columnName" TEXT NOT NULL,
    "wipLimit" INTEGER NOT NULL DEFAULT 0,
    "enforcement" "EnforcementMode" NOT NULL DEFAULT 'WARN',
    "overrideRoles" TEXT[] DEFAULT ARRAY['admin']::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WipPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyOverride" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "actorName" TEXT,
    "actorRole" TEXT,
    "column" TEXT NOT NULL,
    "wipCount" INTEGER NOT NULL,
    "wipLimit" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PolicyOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WipPolicy_columnName_key" ON "WipPolicy"("columnName");

-- AddForeignKey
ALTER TABLE "PolicyOverride" ADD CONSTRAINT "PolicyOverride_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
