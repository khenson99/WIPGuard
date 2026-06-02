-- Remove local task/WIP/project-management storage. Imladris dashboards use
-- provider raw records and canonical metrics instead.

ALTER TABLE IF EXISTS "Conference" DROP CONSTRAINT IF EXISTS "Conference_primaryProjectId_fkey";
ALTER TABLE IF EXISTS "ConferenceDeadline" DROP CONSTRAINT IF EXISTS "ConferenceDeadline_taskId_fkey";
ALTER TABLE IF EXISTS "ConferenceLead" DROP CONSTRAINT IF EXISTS "ConferenceLead_followupTaskId_fkey";
ALTER TABLE IF EXISTS "IntegrationReceipt" DROP CONSTRAINT IF EXISTS "IntegrationReceipt_taskId_fkey";
ALTER TABLE IF EXISTS "CustomerSuccessPlanMilestone" DROP CONSTRAINT IF EXISTS "CustomerSuccessPlanMilestone_linkedTaskId_fkey";
ALTER TABLE IF EXISTS "CustomerSuccessAlertRecord" DROP CONSTRAINT IF EXISTS "CustomerSuccessAlertRecord_linkedTaskId_fkey";

DROP INDEX IF EXISTS "Conference_primaryProjectId_key";
DROP INDEX IF EXISTS "ConferenceDeadline_taskId_key";
DROP INDEX IF EXISTS "ConferenceDeadline_taskId_idx";
DROP INDEX IF EXISTS "ConferenceLead_followupTaskId_key";
DROP INDEX IF EXISTS "ConferenceLead_followupTaskId_idx";
DROP INDEX IF EXISTS "IntegrationReceipt_taskId_idx";
DROP INDEX IF EXISTS "CustomerSuccessPlanMilestone_linkedTaskId_idx";
DROP INDEX IF EXISTS "CustomerSuccessAlertRecord_linkedTaskId_idx";

ALTER TABLE IF EXISTS "Conference" DROP COLUMN IF EXISTS "primaryProjectId";
ALTER TABLE IF EXISTS "ConferenceDeadline" DROP COLUMN IF EXISTS "taskId";
ALTER TABLE IF EXISTS "ConferenceLead" DROP COLUMN IF EXISTS "followupTaskId";
ALTER TABLE IF EXISTS "IntegrationRule" DROP COLUMN IF EXISTS "statusOverride";
ALTER TABLE IF EXISTS "IntegrationReceipt" DROP COLUMN IF EXISTS "taskId";
ALTER TABLE IF EXISTS "UserUiPreference" DROP COLUMN IF EXISTS "tasksConfig";
ALTER TABLE IF EXISTS "UserUiPreference" DROP COLUMN IF EXISTS "projectsConfig";
ALTER TABLE IF EXISTS "CustomerSuccessPlanMilestone" DROP COLUMN IF EXISTS "linkedTaskId";
ALTER TABLE IF EXISTS "CustomerSuccessAlertRecord" DROP COLUMN IF EXISTS "linkedTaskId";

DROP TABLE IF EXISTS "UserSavedView" CASCADE;
DROP TABLE IF EXISTS "PolicyOverride" CASCADE;
DROP TABLE IF EXISTS "WipPolicy" CASCADE;
DROP TABLE IF EXISTS "BoardSettings" CASCADE;
DROP TABLE IF EXISTS "LogbookEntry" CASCADE;
DROP TABLE IF EXISTS "StatusHistory" CASCADE;
DROP TABLE IF EXISTS "SprintCommitment" CASCADE;
DROP TABLE IF EXISTS "PlanningSession" CASCADE;
DROP TABLE IF EXISTS "_TaskWaitingOn" CASCADE;
DROP TABLE IF EXISTS "_TaskDependency" CASCADE;
DROP TABLE IF EXISTS "_TaskInformed" CASCADE;
DROP TABLE IF EXISTS "_TaskConsulted" CASCADE;
DROP TABLE IF EXISTS "_TaskAccountable" CASCADE;
DROP TABLE IF EXISTS "_TaskResponsible" CASCADE;
DROP TABLE IF EXISTS "_ProjectSponsor" CASCADE;
DROP TABLE IF EXISTS "_ProjectInformed" CASCADE;
DROP TABLE IF EXISTS "_ProjectConsulted" CASCADE;
DROP TABLE IF EXISTS "_ProjectAccountable" CASCADE;
DROP TABLE IF EXISTS "_ProjectResponsible" CASCADE;
DROP TABLE IF EXISTS "Task" CASCADE;
DROP TABLE IF EXISTS "Project" CASCADE;
DROP TABLE IF EXISTS "Sprint" CASCADE;

DROP TYPE IF EXISTS "SavedViewScope";
DROP TYPE IF EXISTS "EnforcementMode";
DROP TYPE IF EXISTS "UnplannedReason";
DROP TYPE IF EXISTS "TaskStatus";
DROP TYPE IF EXISTS "Priority";
DROP TYPE IF EXISTS "DifficultyLevel";
DROP TYPE IF EXISTS "ProjectStatus";
DROP TYPE IF EXISTS "ProjectType";
