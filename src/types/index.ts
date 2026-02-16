import type React from "react";

export type TaskStatus =
  | "BACKLOG"
  | "QUEUED"
  | "WORKING_ON_TODAY"
  | "ACTIVE"
  | "NOT_DONE"
  | "DONE";

export type Priority = "P0" | "P1" | "P2" | "P3";
export type DifficultyLevel = "LOW" | "MEDIUM" | "HIGH" | "EPIC";
export type ProjectStatus = "ACTIVE" | "ON_HOLD" | "COMPLETED" | "ARCHIVED";
export type ProjectType = "RECURRING" | "PERPETUAL" | "ONE_OFF";

export const COLUMN_ORDER: TaskStatus[] = [
  "BACKLOG",
  "QUEUED",
  "WORKING_ON_TODAY",
  "ACTIVE",
  "NOT_DONE",
  "DONE",
];

export const COLUMN_LABELS: Record<TaskStatus, string> = {
  BACKLOG: "Backlog",
  QUEUED: "Queued",
  WORKING_ON_TODAY: "Working on Today",
  ACTIVE: "Active",
  NOT_DONE: "Not Done",
  DONE: "Done",
};

export const PRIORITY_COLORS: Record<Priority, string> = {
  P0: "var(--priority-p0)",
  P1: "var(--priority-p1)",
  P2: "var(--priority-p2)",
  P3: "var(--priority-p3)",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: "P0 - Critical",
  P1: "P1 - High",
  P2: "P2 - Medium",
  P3: "P3 - Low",
};

/** Dot color by swim lane (column status) */
export const STATUS_COLORS: Record<TaskStatus, string> = {
  BACKLOG: "var(--status-backlog)",
  QUEUED: "var(--status-queued)",
  WORKING_ON_TODAY: "var(--status-working)",
  ACTIVE: "var(--status-active)",
  NOT_DONE: "var(--status-not-done)",
  DONE: "var(--status-done)",
};

/** Card background + ring styles by difficulty (inline style objects) */
export const DIFFICULTY_STYLES: Record<
  DifficultyLevel,
  React.CSSProperties
> = {
  LOW: {
    background: "var(--diff-low-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-low-ring)",
  },
  MEDIUM: {
    background: "var(--diff-medium-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-medium-ring)",
  },
  HIGH: {
    background: "var(--diff-high-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-high-ring)",
  },
  EPIC: {
    background: "var(--diff-epic-bg)",
    boxShadow: "inset 0 0 0 1px var(--diff-epic-ring)",
  },
};

/** Difficulty tag colors (inline style objects) */
export const DIFFICULTY_TAG_STYLES: Record<
  DifficultyLevel,
  React.CSSProperties
> = {
  LOW: { background: "var(--tag-bg)", color: "var(--muted-foreground)" },
  MEDIUM: { background: "var(--diff-medium-ring)", color: "var(--foreground)" },
  HIGH: { background: "var(--diff-high-ring)", color: "var(--foreground)" },
  EPIC: { background: "var(--diff-epic-ring)", color: "var(--foreground)" },
};

export const DIFFICULTY_LABELS: Record<DifficultyLevel, string> = {
  LOW: "Easy",
  MEDIUM: "Medium",
  HIGH: "Hard",
  EPIC: "Epic",
};

export interface TaskWithRelations {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: Priority;
  degreeOfDifficulty: DifficultyLevel;
  startDate: string | null;
  dueDate: string | null;
  completedOn: string | null;
  assignedOn: string | null;
  parentId: string | null;
  projectId: string | null;
  sprintId: string | null;
  unplanned: boolean;
  slackThread: string | null;
  columnOrder: number;
  createdAt: string;
  updatedAt: string;
  project?: { id: string; name: string } | null;
  sprint?: { id: string; name: string } | null;
  parent?: { id: string; title: string } | null;
  children?: { id: string; title: string; status: TaskStatus; priority: Priority }[];
  dependsOn?: { id: string; title: string; status: TaskStatus }[];
  dependedBy?: { id: string; title: string; status: TaskStatus }[];
  statusHistory?: { id: string; fromStatus: string | null; toStatus: string; changedAt: string; changedBy: string }[];
  logbookEntries?: { id: string; taskTitle: string; archivedAt: string }[];
  responsible?: UserSummary[];
  accountable?: UserSummary[];
  consulted?: UserSummary[];
  informed?: UserSummary[];
}

export interface UserSummary {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface BoardColumn {
  id: TaskStatus;
  label: string;
  wipLimit: number;
  tasks: TaskWithRelations[];
}

export interface SprintSummary {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  projectType: ProjectType;
  companyPriorityId: string | null;
}

export interface DepartmentSummary {
  id: string;
  name: string;
  color: string | null;
  _count?: { projects: number };
}

export interface ProjectWithDetails {
  id: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  projectType: ProjectType;
  departmentId: string | null;
  department: { id: string; name: string; color: string | null } | null;
  companyPriority: { id: string; name: string; color: string | null } | null;
  responsible: UserSummary[];
  accountable: UserSummary[];
  consulted: UserSummary[];
  informed: UserSummary[];
  sponsor: UserSummary[];
  _count: { tasks: number };
  taskStatusCounts?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

export type SavedViewScope = "TASKS" | "PROJECTS";

export interface UserUiPreference {
  id: string;
  userId: string;
  dashboardConfig: Record<string, unknown> | null;
  tasksConfig: Record<string, unknown> | null;
  projectsConfig: Record<string, unknown> | null;
  analyticsConfig: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface UserSavedView {
  id: string;
  userId: string;
  scope: SavedViewScope;
  slug: string;
  name: string;
  isDefault: boolean;
  isSystem: boolean;
  config: Record<string, unknown>;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowScope = "PRIVATE" | "SHARED";
export type WorkflowStatus = "DRAFT" | "ACTIVE" | "PAUSED" | "ERROR" | "ARCHIVED";
export type WorkflowNodeType = "TRIGGER" | "CONDITION" | "ACTION" | "APPROVAL" | "DELAY";
export type WorkflowRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELED";
export type WorkflowStepStatus =
  | "PENDING"
  | "RUNNING"
  | "SUCCEEDED"
  | "FAILED"
  | "SKIPPED"
  | "WAITING_APPROVAL";
export type WorkflowApprovalStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TIMED_OUT"
  | "CANCELED";

export interface WorkflowNode {
  id: string;
  workflowId: string;
  nodeKey: string;
  type: WorkflowNodeType;
  label: string;
  config: Record<string, unknown>;
  positionX: number;
  positionY: number;
}

export interface WorkflowEdge {
  id: string;
  workflowId: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  conditionLabel: string | null;
  conditionExpr: Record<string, unknown> | null;
  priority: number;
}

export interface WorkflowDefinition {
  id: string;
  ownerId: string;
  name: string;
  description: string | null;
  scope: WorkflowScope;
  status: WorkflowStatus;
  providers: string[];
  rolePolicy: Record<string, unknown> | null;
  isSystemManaged: boolean;
  graphVersion: number;
  graph: Record<string, unknown>;
  lastPublishedAt: string | null;
  lastRunAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: string;
  workflowId: string;
  requestedById: string | null;
  triggerProvider: string | null;
  triggerType: string | null;
  triggerId: string | null;
  status: WorkflowRunStatus;
  correlationId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowApproval {
  id: string;
  runId: string;
  stepId: string | null;
  nodeKey: string;
  requestedById: string | null;
  approverId: string | null;
  status: WorkflowApprovalStatus;
  decisionNote: string | null;
  timeoutAt: string | null;
  resolvedAt: string | null;
}
