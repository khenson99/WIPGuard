export interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  order: number;
  projectId: string;
  sprintId?: string;
  assigneeId?: string;
  priority?: string;
  storyPoints?: number;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface Column {
  id: string;
  title: string;
  taskIds: string[];
  color?: string;
  wipLimit?: number;
}

export interface BoardState {
  tasks: Task[];
  columns: Record<string, Column>;
  loading: boolean;
  error: string | null;
}

/**
 * WebSocket event payload types for type-safe event handling.
 */
export interface TaskCreatedEvent {
  task: Task;
}

export interface TaskUpdatedEvent {
  task: Task;
  previousStatus?: string;
}

export interface TaskDeletedEvent {
  taskId: string;
}

export interface TaskReorderedEvent {
  columns: Record<string, string[]>;
}
