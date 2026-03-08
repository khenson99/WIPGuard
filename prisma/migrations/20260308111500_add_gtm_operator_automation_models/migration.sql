-- Extend enums used by the existing automation runtime.
ALTER TYPE "IntegrationProvider" ADD VALUE 'GOOGLE_SEARCH_CONSOLE';
ALTER TYPE "IntegrationProvider" ADD VALUE 'WIPGUARD';
ALTER TYPE "WorkflowRunStatus" ADD VALUE 'WAITING_EXTERNAL';
ALTER TYPE "WorkflowStepStatus" ADD VALUE 'WAITING_EXTERNAL';

-- Create enums for operator-specific automation persistence.
CREATE TYPE "AutomationOperatorKey" AS ENUM (
    'SALES_FOLLOWUP',
    'CUSTOMER_HEALTH',
    'GTM_SCRUM',
    'SEO_GROWTH',
    'ADS_OPTIMIZER',
    'ROADMAP_INTELLIGENCE'
);

CREATE TYPE "AutomationSourceDocumentStatus" AS ENUM ('READY', 'ERROR', 'ARCHIVED');
CREATE TYPE "AutomationArtifactStatus" AS ENUM ('DRAFT', 'READY', 'ERROR', 'ARCHIVED');
CREATE TYPE "AutomationRecommendationStatus" AS ENUM (
    'PENDING_APPROVAL',
    'APPROVED',
    'REJECTED',
    'EXECUTED',
    'FAILED'
);
CREATE TYPE "AutomationAiJobStatus" AS ENUM (
    'QUEUED',
    'REQUESTED',
    'RUNNING',
    'SUCCEEDED',
    'FAILED',
    'CANCELED'
);

ALTER TABLE "WorkflowDefinition"
  ADD COLUMN "operatorKey" "AutomationOperatorKey";

CREATE TABLE "AutomationSourceDocument" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "operatorKey" "AutomationOperatorKey",
    "provider" "IntegrationProvider",
    "eventType" TEXT,
    "externalId" TEXT,
    "documentType" TEXT NOT NULL,
    "status" "AutomationSourceDocumentStatus" NOT NULL DEFAULT 'READY',
    "title" TEXT,
    "mimeType" TEXT,
    "sourceUrl" TEXT,
    "dedupeKey" TEXT,
    "textContent" TEXT,
    "structuredData" JSONB,
    "metadata" JSONB,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationSourceDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationAiJob" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "stepId" TEXT,
    "operatorKey" "AutomationOperatorKey",
    "nodeKey" TEXT NOT NULL,
    "jobType" TEXT NOT NULL,
    "status" "AutomationAiJobStatus" NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL DEFAULT 'openai',
    "model" TEXT NOT NULL,
    "promptVersion" TEXT,
    "requestPayload" JSONB NOT NULL,
    "responseId" TEXT,
    "responseStatus" TEXT,
    "responsePayload" JSONB,
    "outputText" TEXT,
    "parsedOutput" JSONB,
    "lastError" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationAiJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationArtifact" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "sourceDocumentId" TEXT,
    "aiJobId" TEXT,
    "operatorKey" "AutomationOperatorKey",
    "artifactType" TEXT NOT NULL,
    "status" "AutomationArtifactStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "content" TEXT,
    "contentJson" JSONB,
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "createdByNodeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationArtifact_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AutomationRecommendation" (
    "id" TEXT NOT NULL,
    "workflowId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "artifactId" TEXT,
    "aiJobId" TEXT,
    "operatorKey" "AutomationOperatorKey",
    "recommendationType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" TEXT,
    "actionType" TEXT NOT NULL,
    "actionPayload" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "status" "AutomationRecommendationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "priority" TEXT,
    "requestedById" TEXT,
    "approverId" TEXT,
    "executedById" TEXT,
    "decisionNote" TEXT,
    "executionResult" JSONB,
    "executionError" TEXT,
    "dueAt" TIMESTAMP(3),
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "dedupeKey" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutomationRecommendation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AutomationSourceDocument_dedupeKey_key" ON "AutomationSourceDocument"("dedupeKey");
CREATE INDEX "AutomationSourceDocument_workflowId_documentType_observedAt_idx" ON "AutomationSourceDocument"("workflowId", "documentType", "observedAt");
CREATE INDEX "AutomationSourceDocument_runId_documentType_observedAt_idx" ON "AutomationSourceDocument"("runId", "documentType", "observedAt");
CREATE INDEX "AutomationSourceDocument_provider_eventType_observedAt_idx" ON "AutomationSourceDocument"("provider", "eventType", "observedAt");

CREATE UNIQUE INDEX "AutomationAiJob_responseId_key" ON "AutomationAiJob"("responseId");
CREATE UNIQUE INDEX "AutomationAiJob_dedupeKey_key" ON "AutomationAiJob"("dedupeKey");
CREATE INDEX "AutomationAiJob_status_nextAttemptAt_idx" ON "AutomationAiJob"("status", "nextAttemptAt");
CREATE INDEX "AutomationAiJob_runId_status_createdAt_idx" ON "AutomationAiJob"("runId", "status", "createdAt");
CREATE INDEX "AutomationAiJob_workflowId_operatorKey_status_idx" ON "AutomationAiJob"("workflowId", "operatorKey", "status");

CREATE UNIQUE INDEX "AutomationArtifact_dedupeKey_key" ON "AutomationArtifact"("dedupeKey");
CREATE INDEX "AutomationArtifact_workflowId_artifactType_createdAt_idx" ON "AutomationArtifact"("workflowId", "artifactType", "createdAt");
CREATE INDEX "AutomationArtifact_runId_artifactType_createdAt_idx" ON "AutomationArtifact"("runId", "artifactType", "createdAt");
CREATE INDEX "AutomationArtifact_operatorKey_artifactType_status_idx" ON "AutomationArtifact"("operatorKey", "artifactType", "status");

CREATE UNIQUE INDEX "AutomationRecommendation_dedupeKey_key" ON "AutomationRecommendation"("dedupeKey");
CREATE INDEX "AutomationRecommendation_status_approverId_createdAt_idx" ON "AutomationRecommendation"("status", "approverId", "createdAt");
CREATE INDEX "AutomationRecommendation_runId_status_createdAt_idx" ON "AutomationRecommendation"("runId", "status", "createdAt");
CREATE INDEX "AutomationRecommendation_workflowId_operatorKey_status_idx" ON "AutomationRecommendation"("workflowId", "operatorKey", "status");

CREATE INDEX "WorkflowDefinition_operatorKey_status_idx" ON "WorkflowDefinition"("operatorKey", "status");

ALTER TABLE "AutomationSourceDocument"
  ADD CONSTRAINT "AutomationSourceDocument_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationSourceDocument"
  ADD CONSTRAINT "AutomationSourceDocument_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationAiJob"
  ADD CONSTRAINT "AutomationAiJob_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationAiJob"
  ADD CONSTRAINT "AutomationAiJob_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationAiJob"
  ADD CONSTRAINT "AutomationAiJob_stepId_fkey"
  FOREIGN KEY ("stepId") REFERENCES "WorkflowRunStep"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationArtifact"
  ADD CONSTRAINT "AutomationArtifact_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationArtifact"
  ADD CONSTRAINT "AutomationArtifact_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationArtifact"
  ADD CONSTRAINT "AutomationArtifact_sourceDocumentId_fkey"
  FOREIGN KEY ("sourceDocumentId") REFERENCES "AutomationSourceDocument"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationArtifact"
  ADD CONSTRAINT "AutomationArtifact_aiJobId_fkey"
  FOREIGN KEY ("aiJobId") REFERENCES "AutomationAiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_workflowId_fkey"
  FOREIGN KEY ("workflowId") REFERENCES "WorkflowDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_runId_fkey"
  FOREIGN KEY ("runId") REFERENCES "WorkflowRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_artifactId_fkey"
  FOREIGN KEY ("artifactId") REFERENCES "AutomationArtifact"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_aiJobId_fkey"
  FOREIGN KEY ("aiJobId") REFERENCES "AutomationAiJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_requestedById_fkey"
  FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_approverId_fkey"
  FOREIGN KEY ("approverId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AutomationRecommendation"
  ADD CONSTRAINT "AutomationRecommendation_executedById_fkey"
  FOREIGN KEY ("executedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
