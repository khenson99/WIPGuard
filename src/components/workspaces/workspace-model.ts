export interface WorkspaceAction {
  href: string;
  label: string;
}

export interface WorkspaceStat {
  label: string;
  value: string;
  detail?: string;
}

export interface WorkspaceRecord {
  title: string;
  description: string;
  href?: string;
  label?: string;
}

export interface WorkspacePageModel {
  eyebrow: string;
  title: string;
  summary: string;
  primaryAction?: WorkspaceAction;
  secondaryAction?: WorkspaceAction;
  stats: WorkspaceStat[];
  records: WorkspaceRecord[];
  preservedSystems: string[];
}
