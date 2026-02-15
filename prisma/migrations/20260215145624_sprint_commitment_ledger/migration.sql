-- CreateEnum
CREATE TYPE "UnplannedReason" AS ENUM ('ESCALATION', 'BUG_FIX', 'CUSTOMER_REQUEST', 'SCOPE_CHANGE', 'DEPENDENCY', 'OTHER');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "addedBy" TEXT,
ADD COLUMN     "planningSessionId" TEXT,
ADD COLUMN     "unplannedNote" TEXT,
ADD COLUMN     "unplannedReason" "UnplannedReason";

-- CreateTable
CREATE TABLE "SprintCommitment" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "taskSnapshots" JSONB NOT NULL,

    CONSTRAINT "SprintCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlanningSession" (
    "id" TEXT NOT NULL,
    "sprintId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "PlanningSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SprintCommitment_sprintId_snapshotAt_idx" ON "SprintCommitment"("sprintId", "snapshotAt");

-- CreateIndex
CREATE INDEX "PlanningSession_sprintId_idx" ON "PlanningSession"("sprintId");

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_planningSessionId_fkey" FOREIGN KEY ("planningSessionId") REFERENCES "PlanningSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SprintCommitment" ADD CONSTRAINT "SprintCommitment_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlanningSession" ADD CONSTRAINT "PlanningSession_sprintId_fkey" FOREIGN KEY ("sprintId") REFERENCES "Sprint"("id") ON DELETE CASCADE ON UPDATE CASCADE;
