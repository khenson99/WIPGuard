/**
 * RACI Inheritance Engine
 *
 * Resolves RACI roles for a task by walking up the hierarchy:
 *   Task -> parent Task(s) -> Project -> parent Project(s) -> CompanyPriority
 *
 * Precedence: "nearest-wins" — the closest ancestor with a non-empty
 * RACI role array takes precedence. Each role (R, A, C, I) is resolved
 * independently, so a task can inherit R from its parent task and A from
 * its project.
 */

// Minimal user shape returned by RACI resolution
export interface RaciUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
}

export interface RaciAssignment {
  responsible: RaciUser[];
  accountable: RaciUser[];
  consulted: RaciUser[];
  informed: RaciUser[];
}

export interface RaciSource {
  level: "task" | "project" | "priority";
  id: string;
  name: string;
}

export interface ResolvedRaci {
  effective: RaciAssignment;
  sources: {
    responsible: RaciSource | null;
    accountable: RaciSource | null;
    consulted: RaciSource | null;
    informed: RaciSource | null;
  };
}

// A node in the hierarchy with RACI data attached
export interface RaciNode {
  id: string;
  name: string;
  level: "task" | "project" | "priority";
  responsible: RaciUser[];
  accountable: RaciUser[];
  consulted: RaciUser[];
  informed: RaciUser[];
}

const RACI_ROLES = ["responsible", "accountable", "consulted", "informed"] as const;

/**
 * Build the ancestor chain for a given task, ordered from the task itself
 * up through parent tasks, then project chain, then company priority.
 */
export function buildAncestorChain(
  task: RaciNode & {
    parentChain?: RaciNode[];
    project?: (RaciNode & { parentChain?: RaciNode[]; priority?: RaciNode | null }) | null;
  },
): RaciNode[] {
  const chain: RaciNode[] = [task];

  // Walk parent tasks
  if (task.parentChain) {
    chain.push(...task.parentChain);
  }

  // Walk project chain
  if (task.project) {
    chain.push(task.project);
    if (task.project.parentChain) {
      chain.push(...task.project.parentChain);
    }
    // Company priority at the top
    if (task.project.priority) {
      chain.push(task.project.priority);
    }
  }

  return chain;
}

/**
 * Resolve RACI assignments using nearest-wins precedence.
 * Each role is resolved independently by walking the ancestor chain
 * and picking the first ancestor with a non-empty array for that role.
 */
export function resolveRaci(ancestorChain: RaciNode[]): ResolvedRaci {
  const effective: RaciAssignment = {
    responsible: [],
    accountable: [],
    consulted: [],
    informed: [],
  };

  const sources: ResolvedRaci["sources"] = {
    responsible: null,
    accountable: null,
    consulted: null,
    informed: null,
  };

  for (const role of RACI_ROLES) {
    for (const node of ancestorChain) {
      if (node[role].length > 0) {
        effective[role] = node[role];
        sources[role] = { level: node.level, id: node.id, name: node.name };
        break;
      }
    }
  }

  return { effective, sources };
}

/**
 * Convenience: build chain + resolve in one call.
 */
export function resolveTaskRaci(
  task: RaciNode & {
    parentChain?: RaciNode[];
    project?: (RaciNode & { parentChain?: RaciNode[]; priority?: RaciNode | null }) | null;
  },
): ResolvedRaci {
  const chain = buildAncestorChain(task);
  return resolveRaci(chain);
}
