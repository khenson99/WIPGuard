-- CreateEnum
CREATE TYPE "SavedViewScope" AS ENUM ('TASKS', 'PROJECTS');

-- CreateEnum
CREATE TYPE "WorkflowScope" AS ENUM ('PRIVATE', 'SHARED');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ERROR', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "WorkflowNodeType" AS ENUM ('TRIGGER', 'CONDITION', 'ACTION', 'APPROVAL', 'DELAY');

-- CreateEnum
CREATE TYPE "WorkflowRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'WAITING_APPROVAL', 'SUCCEEDED', 'FAILED', 'CANCELED');

-- CreateEnum
CREATE TYPE "WorkflowStepStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED', 'WAITING_APPROVAL');

-- CreateEnum
CREATE TYPE "WorkflowApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'TIMED_OUT', 'CANCELED');

-- CreateEnum
CREATE TYPE "WorkflowEventStatus" AS ENUM ('QUEUED', 'DISPATCHED', 'FAILED', 'DEAD_LETTER');

-- CreateTable
CREATE TABLE "UserUiPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dashboardConfig" JSONB,
    "tasksConfig" JSONB,
    "projectsConfig" JSONB,
    "analyticsConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserUiPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserSavedView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "scope" "SavedViewScope" NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "config" JSONB NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserSavedView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowDefinition" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope" "WorkflowScope" NOT NULL DEFAULT 'PRIVATE',
    "status" "WorkflowStatus" NOT NULL DEFAULT 'DRAFT',
    "providers" "IntegrationProvider"[] DEFAULT ARRAY[]::"IntegrationProvider"[],
    "rolePolicy" JSONB,
    "isSystemManaged" BOOLEAN NOT NULL DEFAULT false,
    "graphVersion" INTEGER NOT NULL DEFAULT 1,
    "graph" JSONB NOT NULL,
    "lastPublishedAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowNode" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "type" "WorkflowNodeType" NOT NULL,
    "label" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "positionX" INTEGER NOT NULL DEFAULT 0,
    "positionY" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowEdge" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "sourceNodeKey" TEXT NOT NULL,
    "targetNodeKey" TEXT NOT NULL,
    "conditionLabel" TEXT,
    "conditionExpr" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRun" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "requestedById" TEXT,
    "triggerProvider" "IntegrationProvider",
    "triggerType" TEXT,
    "triggerId" TEXT,
    "triggerPayload" JSONB,
    "dedupeKey" TEXT,
    "status" "WorkflowRunStatus" NOT NULL DEFAULT 'QUEUED',
    "correlationId" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "nodeKey" TEXT NOT NULL,
    "nodeType" "WorkflowNodeType" NOT NULL,
    "status" "WorkflowStepStatus" NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "idempotencyKey" TEXT,
    "input" JSONB,
    "output" JSONB,
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowApproval" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "nodeKey" TEXT NOT NULL,
    "requestedById" TEXT,
    "approverId" TEXT,
    "status" "WorkflowApprovalStatus" NOT NULL DEFAULT 'PENDING',
    "decisionNote" TEXT,
    "timeoutAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "fallbackEdgeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowApproval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTriggerCursor" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "cursorKey" TEXT NOT NULL,
    "cursorValue" JSONB,
    "lastEventAt" TIMESTAMP(3),
    "lastRunAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTriggerCursor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTriggerEvent" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT,
    "provider" "IntegrationProvider" NOT NULL,
    "eventType" TEXT NOT NULL,
    "externalId" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "WorkflowEventStatus" NOT NULL DEFAULT 'QUEUED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTriggerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserUiPreference_userId_key" ON "UserUiPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserSavedView_userId_scope_slug_key" ON "UserSavedView"("userId", "scope", "slug");

-- CreateIndex
CREATE INDEX "UserSavedView_userId_scope_isDefault_idx" ON "UserSavedView"("userId", "scope", "isDefault");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_ownerId_status_idx" ON "WorkflowDefinition"("ownerId", "status");

-- CreateIndex
CREATE INDEX "WorkflowDefinition_scope_status_idx" ON "WorkflowDefinition"("scope", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowNode_workflowId_nodeKey_key" ON "WorkflowNode"("workflowId", "nodeKey");

-- CreateIndex
CREATE INDEX "WorkflowNode_workflowId_type_idx" ON "WorkflowNode"("workflowId", "type");

-- CreateIndex
CREATE INDEX "WorkflowEdge_workflowId_sourceNodeKey_priority_idx" ON "WorkflowEdge"("workflowId", "sourceNodeKey", "priority");

-- CreateIndex
CREATE INDEX "WorkflowEdge_workflowId_targetNodeKey_idx" ON "WorkflowEdge"("workflowId", "targetNodeKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRun_dedupeKey_key" ON "WorkflowRun"("dedupeKey");

-- CreateIndex
CREATE INDEX "WorkflowRun_workflowId_status_createdAt_idx" ON "WorkflowRun"("workflowId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowRun_triggerProvider_triggerType_idx" ON "WorkflowRun"("triggerProvider", "triggerType");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowRunStep_idempotencyKey_key" ON "WorkflowRunStep"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowRunStep_runId_nodeKey_status_idx" ON "WorkflowRunStep"("runId", "nodeKey", "status");

-- CreateIndex
CREATE INDEX "WorkflowApproval_status_approverId_timeoutAt_idx" ON "WorkflowApproval"("status", "approverId", "timeoutAt");

-- CreateIndex
CREATE INDEX "WorkflowApproval_runId_status_idx" ON "WorkflowApproval"("runId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTriggerCursor_workflowId_provider_cursorKey_key" ON "WorkflowTriggerCursor"("workflowId", "provider", "cursorKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTriggerEvent_idempotencyKey_key" ON "WorkflowTriggerEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkflowTriggerEvent_status_nextAttemptAt_idx" ON "WorkflowTriggerEvent"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "WorkflowTriggerEvent_provider_eventType_observedAt_idx" ON "WorkflowTriggerEvent"("provider", "eventType", "observedAt");

-- AddForeignKey
ALTER TABLE "UserUiPreference" ADD CONSTRAINT "UserUiPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserSavedView" ADD CONSTRAINT "UserSavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowDefinition" ADD CONSTRAINT "WorkflowDefinition_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowNode" ADD CONSTRAINT "WorkflowNode_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowEdge" ADD CONSTRAINT "WorkflowEdge_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRun" ADD CONSTRAINT "WorkflowRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowRunStep" ADD CONSTRAINT "WorkflowRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_runId_fkey" FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "WorkflowRunStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowApproval" ADD CONSTRAINT "WorkflowApproval_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTriggerCursor" ADD CONSTRAINT "WorkflowTriggerCursor_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTriggerEvent" ADD CONSTRAINT "WorkflowTriggerEvent_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
