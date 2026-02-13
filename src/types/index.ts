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
  P0: "#dc2626",
  P1: "#ea580c",
  P2: "#2563eb",
  P3: "#6b7280",
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  P0: "P0 - Critical",
  P1: "P1 - High",
  P2: "P2 - Medium",
  P3: "P3 - Low",
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
