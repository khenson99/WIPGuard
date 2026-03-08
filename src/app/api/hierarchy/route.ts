export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforcePermission } from "@/lib/permissions";
import {
  createHierarchyCacheKey,
  getCachedHierarchy,
  setCachedHierarchy,
} from "@/lib/hierarchy-cache";
import { getAuthenticatedUser } from "@/lib/session-user";
import { resolveRaci, type RaciNode, type ResolvedRaci } from "@/lib/raci-inheritance";

const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  image: true,
} as const;

const MAX_DEPTH = 5;

// ---------- Response types ----------

interface HierarchyTask {
  id: string;
  title: string;
  status: string;
  priority: string;
  parentId: string | null;
  projectId: string | null;
  raci: ResolvedRaci;
  children: HierarchyTask[];
}

interface HierarchyProject {
  id: string;
  name: string;
  status: string;
  parentId: string | null;
  companyPriorityId: string | null;
  raci: ResolvedRaci;
  children: HierarchyProject[];
  tasks: HierarchyTask[];
}

interface HierarchyPriority {
  id: string;
  name: string;
  priority: number;
  raci: ResolvedRaci;
  projects: HierarchyProject[];
}

// ---------- Helpers ----------

function toRaciNode(
  entity: {
    id: string;
    name?: string;
    title?: string;
    responsible: { id: string; name: string | null; email: string; image: string | null }[];
    accountable: { id: string; name: string | null; email: string; image: string | null }[];
    consulted: { id: string; name: string | null; email: string; image: string | null }[];
    informed: { id: string; name: string | null; email: string; image: string | null }[];
  },
  level: "task" | "project" | "priority",
): RaciNode {
  return {
    id: entity.id,
    name: entity.name ?? entity.title ?? "",
    level,
    responsible: entity.responsible,
    accountable: entity.accountable,
    consulted: entity.consulted,
    informed: entity.informed,
  };
}

/**
 * Build a task tree from a flat list. Each task has parentId; we nest children
 * under their parent. Tasks whose parentId doesn't appear in the list are roots
 * (either top-level tasks or tasks whose parent is outside this project).
 */
function buildTaskTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tasks: any[],
  projectAncestorChain: RaciNode[],
  depth: number,
): HierarchyTask[] {
  const taskMap = new Map<string, HierarchyTask>();
  const taskNodeMap = new Map<string, RaciNode>();

  // First pass: create all nodes
  for (const t of tasks) {
    const node = toRaciNode(t, "task");
    taskNodeMap.set(t.id, node);
    taskMap.set(t.id, {
      id: t.id,
      title: t.title,
      status: t.status,
      priority: t.priority,
      parentId: t.parentId,
      projectId: t.projectId,
      raci: { effective: { responsible: [], accountable: [], consulted: [], informed: [] }, sources: { responsible: null, accountable: null, consulted: null, informed: null } },
      children: [],
    });
  }

  // Build parent chains for tasks and resolve RACI
  for (const t of tasks) {
    const taskParentChain: RaciNode[] = [];
    let currentId = t.parentId;
    const visited = new Set<string>();
    while (currentId && taskNodeMap.has(currentId) && !visited.has(currentId)) {
      visited.add(currentId);
      taskParentChain.push(taskNodeMap.get(currentId)!);
      const parentTask = tasks.find((tt: { id: string }) => tt.id === currentId);
      currentId = parentTask?.parentId ?? null;
    }

    const chain: RaciNode[] = [taskNodeMap.get(t.id)!, ...taskParentChain, ...projectAncestorChain];
    taskMap.get(t.id)!.raci = resolveRaci(chain);
  }

  // Second pass: nest children
  const roots: HierarchyTask[] = [];
  for (const t of tasks) {
    const entry = taskMap.get(t.id)!;
    if (t.parentId && taskMap.has(t.parentId)) {
      taskMap.get(t.parentId)!.children.push(entry);
    } else {
      roots.push(entry);
    }
  }

  // Trim depth
  if (depth < MAX_DEPTH) {
    trimTaskTree(roots, 0, depth);
  }

  return roots;
}

function trimTaskTree(nodes: HierarchyTask[], currentDepth: number, maxDepth: number): void {
  for (const node of nodes) {
    if (currentDepth >= maxDepth) {
      node.children = [];
    } else {
      trimTaskTree(node.children, currentDepth + 1, maxDepth);
    }
  }
}

function buildProjectTree(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  projects: any[],
  priorityNode: RaciNode | null,
  taskDepth: number,
): HierarchyProject[] {
  const projectMap = new Map<string, HierarchyProject>();
  const projectNodeMap = new Map<string, RaciNode>();

  // First pass: create all nodes
  for (const p of projects) {
    const node = toRaciNode(p, "project");
    projectNodeMap.set(p.id, node);
    projectMap.set(p.id, {
      id: p.id,
      name: p.name,
      status: p.status,
      parentId: p.parentId,
      companyPriorityId: p.companyPriorityId,
      raci: { effective: { responsible: [], accountable: [], consulted: [], informed: [] }, sources: { responsible: null, accountable: null, consulted: null, informed: null } },
      children: [],
      tasks: [],
    });
  }

  // Build parent chains for projects and resolve RACI + build task trees
  for (const p of projects) {
    const projectParentChain: RaciNode[] = [];
    let currentId = p.parentId;
    const visited = new Set<string>();
    while (currentId && projectNodeMap.has(currentId) && !visited.has(currentId)) {
      visited.add(currentId);
      projectParentChain.push(projectNodeMap.get(currentId)!);
      const parentProject = projects.find((pp: { id: string }) => pp.id === currentId);
      currentId = parentProject?.parentId ?? null;
    }

    const projectChain: RaciNode[] = [projectNodeMap.get(p.id)!, ...projectParentChain];
    if (priorityNode) {
      projectChain.push(priorityNode);
    }

    projectMap.get(p.id)!.raci = resolveRaci(projectChain);

    // Build task tree for this project
    if (p.tasks && p.tasks.length > 0) {
      projectMap.get(p.id)!.tasks = buildTaskTree(p.tasks, projectChain, taskDepth);
    }
  }

  // Second pass: nest children
  const roots: HierarchyProject[] = [];
  for (const p of projects) {
    const entry = projectMap.get(p.id)!;
    if (p.parentId && projectMap.has(p.parentId)) {
      projectMap.get(p.parentId)!.children.push(entry);
    } else {
      roots.push(entry);
    }
  }

  return roots;
}

// ---------- Shared include for RACI on any entity ----------

const RACI_INCLUDE = {
  responsible: { select: USER_SELECT },
  accountable: { select: USER_SELECT },
  consulted: { select: USER_SELECT },
  informed: { select: USER_SELECT },
} as const;

// ---------- GET /api/hierarchy ----------

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await auth();
    const user = getAuthenticatedUser(session);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const permission = await enforcePermission({
      userId: user.id,
      action: "hierarchy.read",
      request,
      targetType: "hierarchy",
    });
    if (permission.deniedResponse) {
      return permission.deniedResponse;
    }

    const { searchParams } = request.nextUrl;
    const depthParam = searchParams.get("depth");
    const depth = depthParam ? Math.min(Math.max(parseInt(depthParam, 10) || MAX_DEPTH, 1), MAX_DEPTH) : MAX_DEPTH;
    const priorityId = searchParams.get("priorityId");
    const projectId = searchParams.get("projectId");
    const flat = searchParams.get("flat") === "true";
    const cacheKey = createHierarchyCacheKey({
      userId: user.id,
      depth,
      priorityId,
      projectId,
      flat,
    });
    const cached = getCachedHierarchy(cacheKey);

    if (cached) {
      return NextResponse.json(cached);
    }

    // Single project mode: return just one project subtree
    if (projectId) {
      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: {
          ...RACI_INCLUDE,
          companyPriority: {
            include: RACI_INCLUDE,
          },
          parent: {
            include: RACI_INCLUDE,
          },
          children: {
            include: {
              ...RACI_INCLUDE,
              tasks: {
                include: RACI_INCLUDE,
                orderBy: { columnOrder: "asc" },
              },
            },
          },
          tasks: {
            include: RACI_INCLUDE,
            orderBy: { columnOrder: "asc" },
          },
        },
      });

      if (!project) {
        return NextResponse.json({ error: "Project not found" }, { status: 404 });
      }

      // Build ancestor chain for the project
      const projectNode = toRaciNode(project, "project");
      const priorityNode = project.companyPriority
        ? toRaciNode(project.companyPriority, "priority")
        : null;

      const projectChain: RaciNode[] = [projectNode];
      if (project.parent) {
        projectChain.push(toRaciNode(project.parent, "project"));
      }
      if (priorityNode) {
        projectChain.push(priorityNode);
      }

      const raci = resolveRaci(projectChain);
      const taskTree = buildTaskTree(project.tasks, projectChain, depth);

      // Build child project trees
      const childProjects = buildProjectTree(project.children, priorityNode, depth);

      const result = {
        id: project.id,
        name: project.name,
        status: project.status,
        parentId: project.parentId,
        companyPriorityId: project.companyPriorityId,
        raci,
        children: childProjects,
        tasks: taskTree,
      };

      setCachedHierarchy(cacheKey, result as Record<string, unknown>);
      return NextResponse.json(result);
    }

    // Full hierarchy mode: Priority -> Project -> Task tree
    const priorityWhere = priorityId ? { id: priorityId } : {};

    const [priorities, orphanProjects, unassignedTasks] = await Promise.all([
      prisma.companyPriority.findMany({
        where: priorityWhere,
        include: {
          ...RACI_INCLUDE,
          projects: {
            include: {
              ...RACI_INCLUDE,
              tasks: {
                include: RACI_INCLUDE,
                orderBy: { columnOrder: "asc" },
              },
            },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { priority: "asc" },
      }),
      priorityId
        ? Promise.resolve([])
        : prisma.project.findMany({
            where: { companyPriorityId: null },
            include: {
              ...RACI_INCLUDE,
              tasks: {
                include: RACI_INCLUDE,
                orderBy: { columnOrder: "asc" },
              },
            },
            orderBy: { createdAt: "desc" },
          }),
      priorityId
        ? Promise.resolve([])
        : prisma.task.findMany({
            where: { projectId: null },
            include: RACI_INCLUDE,
            orderBy: { columnOrder: "asc" },
          }),
    ]);

    const result: HierarchyPriority[] = priorities.map((cp) => {
      const priorityNode = toRaciNode(cp, "priority");
      return {
        id: cp.id,
        name: cp.name,
        priority: cp.priority,
        raci: resolveRaci([priorityNode]),
        projects: buildProjectTree(cp.projects, priorityNode, depth),
      };
    });

    // Build orphan project trees (no priority)
    const orphanProjectTree = buildProjectTree(orphanProjects, null, depth);

    // Build unassigned task tree
    const unassignedTaskTree = buildTaskTree(unassignedTasks, [], depth);

    if (flat) {
      // Flat mode: flatten the tree for table consumers
      const flatItems = flattenHierarchy(result, orphanProjectTree, unassignedTaskTree);
      const responseBody = { items: flatItems, mode: "flat" as const };
      setCachedHierarchy(cacheKey, responseBody as Record<string, unknown>);
      return NextResponse.json(responseBody);
    }

    const responseBody = {
      priorities: result,
      orphanProjects: orphanProjectTree,
      unassignedTasks: unassignedTaskTree,
      mode: "tree",
    };

    setCachedHierarchy(cacheKey, responseBody as Record<string, unknown>);
    return NextResponse.json(responseBody);
  } catch (error) {
    console.error("GET /api/hierarchy error:", error);
    return NextResponse.json(
      { error: "Failed to fetch hierarchy" },
      { status: 500 },
    );
  }
}

// ---------- Flat mode for table consumers ----------

interface FlatItem {
  type: "priority" | "project" | "task";
  id: string;
  name: string;
  depth: number;
  parentId: string | null;
  parentType: "priority" | "project" | "task" | null;
  status?: string;
  priority?: string | number;
  raci: ResolvedRaci;
}

function flattenHierarchy(
  priorities: HierarchyPriority[],
  orphanProjects: HierarchyProject[],
  unassignedTasks: HierarchyTask[],
): FlatItem[] {
  const items: FlatItem[] = [];

  for (const cp of priorities) {
    items.push({
      type: "priority",
      id: cp.id,
      name: cp.name,
      depth: 0,
      parentId: null,
      parentType: null,
      priority: cp.priority,
      raci: cp.raci,
    });
    flattenProjects(cp.projects, cp.id, "priority", 1, items);
  }

  for (const p of orphanProjects) {
    flattenProjectNode(p, null, null, 0, items);
  }

  for (const t of unassignedTasks) {
    flattenTaskNode(t, null, null, 0, items);
  }

  return items;
}

function flattenProjects(
  projects: HierarchyProject[],
  parentId: string,
  parentType: "priority" | "project",
  depth: number,
  items: FlatItem[],
): void {
  for (const p of projects) {
    flattenProjectNode(p, parentId, parentType, depth, items);
  }
}

function flattenProjectNode(
  p: HierarchyProject,
  parentId: string | null,
  parentType: "priority" | "project" | null,
  depth: number,
  items: FlatItem[],
): void {
  items.push({
    type: "project",
    id: p.id,
    name: p.name,
    depth,
    parentId,
    parentType,
    status: p.status,
    raci: p.raci,
  });

  flattenProjects(p.children, p.id, "project", depth + 1, items);

  for (const t of p.tasks) {
    flattenTaskNode(t, p.id, "project", depth + 1, items);
  }
}

function flattenTaskNode(
  t: HierarchyTask,
  parentId: string | null,
  parentType: "priority" | "project" | "task" | null,
  depth: number,
  items: FlatItem[],
): void {
  items.push({
    type: "task",
    id: t.id,
    name: t.title,
    depth,
    parentId,
    parentType,
    status: t.status,
    priority: t.priority,
    raci: t.raci,
  });

  for (const child of t.children) {
    flattenTaskNode(child, t.id, "task", depth + 1, items);
  }
}
