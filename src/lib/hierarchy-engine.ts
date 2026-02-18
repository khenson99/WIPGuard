/**
 * Hierarchy Engine — integrity constraints, orphan detection,
 * deterministic RACI resolution, and cycle / depth validation.
 *
 * All functions are pure (no DB, no HTTP) so they can be unit-tested
 * without infrastructure.
 *
 * WGX-005: Hierarchy correctness and inheritance engine hardening
 */

import {
  resolveRaci as baseResolveRaci,
  type RaciNode,
  type RaciUser,
  type ResolvedRaci,
} from "./raci-inheritance";

// ─── Constants ───────────────────────────────────────────────────────
/** Maximum nesting depth allowed for any hierarchy branch. */
export const MAX_HIERARCHY_DEPTH = 10;

// ─── Generic hierarchy node ──────────────────────────────────────────
/**
 * Minimal shape of any node that participates in a parent-child tree.
 * Works for Task, Project, or any self-referential hierarchy.
 */
export interface HierarchyNode {
  id: string;
  parentId: string | null;
}

// ─── Cycle detection ─────────────────────────────────────────────────
export interface CycleCheckResult {
  hasCycle: boolean;
  /** The node IDs involved in the cycle (empty if no cycle). */
  cycleNodeIds: string[];
}

/**
 * Detect whether assigning `targetId.parentId = proposedParentId` would
 * create a cycle in the tree rooted at the nodes provided.
 *
 * Also detects if a node is its own parent.
 */
export function wouldCreateCycle(
  nodes: HierarchyNode[],
  targetId: string,
  proposedParentId: string | null,
): CycleCheckResult {
  if (proposedParentId === null) {
    return { hasCycle: false, cycleNodeIds: [] };
  }

  // Self-reference is always a cycle
  if (targetId === proposedParentId) {
    return { hasCycle: true, cycleNodeIds: [targetId] };
  }

  // Build a lookup by id
  const nodeMap = new Map<string, HierarchyNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Temporarily apply the proposed change
  const modifiedMap = new Map(nodeMap);
  modifiedMap.set(targetId, { id: targetId, parentId: proposedParentId });

  // Walk from proposedParentId upward — if we reach targetId we have a cycle
  const visited = new Set<string>();
  let current: string | null = proposedParentId;
  const path: string[] = [targetId];

  while (current !== null) {
    if (current === targetId) {
      path.push(current);
      return { hasCycle: true, cycleNodeIds: path };
    }
    if (visited.has(current)) {
      // We've entered a pre-existing cycle that doesn't include targetId.
      // That's a data-integrity issue but not caused by our proposed change.
      break;
    }
    visited.add(current);
    path.push(current);
    const node = modifiedMap.get(current);
    current = node?.parentId ?? null;
  }

  return { hasCycle: false, cycleNodeIds: [] };
}

/**
 * Scan an entire set of nodes and report ALL cycles.
 * Returns the set of node IDs that participate in any cycle.
 */
export function detectCycles(nodes: HierarchyNode[]): Set<string> {
  const nodeMap = new Map<string, HierarchyNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const cycleMembers = new Set<string>();

  // For each node, walk parents; if we revisit a node we've seen in
  // *this* walk, everything from that node onward is in a cycle.
  for (const node of nodes) {
    const visited = new Map<string, number>(); // id -> position in path
    const path: string[] = [];
    let current: string | null = node.id;

    while (current !== null) {
      if (visited.has(current)) {
        // Mark every node from the first occurrence of `current` onward
        const cycleStart = visited.get(current)!;
        for (let i = cycleStart; i < path.length; i++) {
          cycleMembers.add(path[i]);
        }
        break;
      }
      // If this node has already been identified as a cycle member, stop
      if (cycleMembers.has(current) && current !== node.id) break;

      visited.set(current, path.length);
      path.push(current);
      const n = nodeMap.get(current);
      current = n?.parentId ?? null;
    }
  }

  return cycleMembers;
}

// ─── Orphan detection ────────────────────────────────────────────────
export interface OrphanResult {
  /** Nodes whose parentId references a non-existent node. */
  orphanedNodes: HierarchyNode[];
}

/**
 * Find nodes whose `parentId` points to an ID not present in the
 * provided node set. Nodes with `parentId === null` are roots, not orphans.
 */
export function detectOrphans(nodes: HierarchyNode[]): OrphanResult {
  const idSet = new Set(nodes.map((n) => n.id));
  const orphanedNodes = nodes.filter(
    (n) => n.parentId !== null && !idSet.has(n.parentId),
  );
  return { orphanedNodes };
}

// ─── Depth validation ────────────────────────────────────────────────
export interface DepthResult {
  /** Mapping of node ID -> its depth (root = 0). */
  depths: Map<string, number>;
  /** Nodes that exceed `maxDepth`. */
  violations: HierarchyNode[];
  maxObservedDepth: number;
}

/**
 * Compute the depth of every node in the tree and flag any that exceed
 * the given limit. Roots (parentId === null) are depth 0.
 *
 * Nodes whose parentId references a missing node are treated as depth 0
 * (orphaned roots). Cycle members get depth -1 to distinguish them.
 */
export function computeDepths(
  nodes: HierarchyNode[],
  maxDepth: number = MAX_HIERARCHY_DEPTH,
): DepthResult {
  const nodeMap = new Map<string, HierarchyNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  const depths = new Map<string, number>();
  const cycleNodes = detectCycles(nodes);

  function getDepth(id: string): number {
    if (depths.has(id)) return depths.get(id)!;
    if (cycleNodes.has(id)) {
      depths.set(id, -1);
      return -1;
    }

    const node = nodeMap.get(id);
    if (!node || node.parentId === null || !nodeMap.has(node.parentId)) {
      depths.set(id, 0);
      return 0;
    }

    const parentDepth = getDepth(node.parentId);
    const d = parentDepth === -1 ? -1 : parentDepth + 1;
    depths.set(id, d);
    return d;
  }

  for (const n of nodes) {
    getDepth(n.id);
  }

  const violations: HierarchyNode[] = [];
  let maxObservedDepth = 0;
  for (const [id, d] of depths) {
    if (d > maxObservedDepth) maxObservedDepth = d;
    if (d > maxDepth) {
      violations.push(nodeMap.get(id)!);
    }
  }

  return { depths, violations, maxObservedDepth };
}

// ─── Deterministic RACI resolution ──────────────────────────────────
/**
 * Sort users deterministically within each RACI role.
 * Tiebreaker: alphabetical by `id` (CUIDs are lexicographically sortable
 * by creation time). This ensures that for the same input data, output
 * order is always identical regardless of Map iteration order, DB fetch
 * order, etc.
 */
function sortUsers(users: RaciUser[]): RaciUser[] {
  return [...users].sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * Deterministic wrapper around the base `resolveRaci`.
 * Guarantees stable ordering of users within each role (sorted by user ID).
 */
export function resolveRaciDeterministic(ancestorChain: RaciNode[]): ResolvedRaci {
  const result = baseResolveRaci(ancestorChain);
  return {
    effective: {
      responsible: sortUsers(result.effective.responsible),
      accountable: sortUsers(result.effective.accountable),
      consulted: sortUsers(result.effective.consulted),
      informed: sortUsers(result.effective.informed),
    },
    sources: result.sources,
  };
}

// ─── Integrity validation (composite) ────────────────────────────────
export interface IntegrityReport {
  /** Whether the hierarchy passes all checks. */
  valid: boolean;
  cycles: Set<string>;
  orphans: HierarchyNode[];
  depthViolations: HierarchyNode[];
  maxObservedDepth: number;
}

/**
 * Run all integrity checks on a set of hierarchy nodes in one pass.
 */
export function validateHierarchy(
  nodes: HierarchyNode[],
  maxDepth: number = MAX_HIERARCHY_DEPTH,
): IntegrityReport {
  const cycles = detectCycles(nodes);
  const { orphanedNodes: orphans } = detectOrphans(nodes);
  const { violations: depthViolations, maxObservedDepth } = computeDepths(nodes, maxDepth);

  const valid = cycles.size === 0 && orphans.length === 0 && depthViolations.length === 0;

  return {
    valid,
    cycles,
    orphans,
    depthViolations,
    maxObservedDepth,
  };
}

// ─── Parent assignment validation ────────────────────────────────────
export interface ParentAssignmentValidation {
  allowed: boolean;
  reason?: string;
}

/**
 * Validate whether a node can be assigned the given parentId.
 * Checks for cycles, self-reference, and depth limits.
 */
export function validateParentAssignment(
  nodes: HierarchyNode[],
  targetId: string,
  proposedParentId: string | null,
  maxDepth: number = MAX_HIERARCHY_DEPTH,
): ParentAssignmentValidation {
  // Null parent is always allowed (makes it a root)
  if (proposedParentId === null) {
    return { allowed: true };
  }

  // Self-reference
  if (targetId === proposedParentId) {
    return { allowed: false, reason: "A node cannot be its own parent" };
  }

  // Parent must exist in the node set
  const nodeMap = new Map<string, HierarchyNode>();
  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }
  if (!nodeMap.has(proposedParentId)) {
    return { allowed: false, reason: `Parent node "${proposedParentId}" does not exist` };
  }

  // Cycle check
  const cycleResult = wouldCreateCycle(nodes, targetId, proposedParentId);
  if (cycleResult.hasCycle) {
    return {
      allowed: false,
      reason: `Would create a cycle: ${cycleResult.cycleNodeIds.join(" -> ")}`,
    };
  }

  // Depth check: simulate the change and recompute depths
  const modifiedNodes = nodes.map((n) =>
    n.id === targetId ? { ...n, parentId: proposedParentId } : n,
  );
  const { violations } = computeDepths(modifiedNodes, maxDepth);
  if (violations.length > 0) {
    return {
      allowed: false,
      reason: `Would exceed maximum depth of ${maxDepth}`,
    };
  }

  return { allowed: true };
}

// ─── Tree construction utility ───────────────────────────────────────
export interface TreeNode<T extends HierarchyNode> {
  node: T;
  children: TreeNode<T>[];
  depth: number;
}

/**
 * Build a tree from a flat list of hierarchy nodes.
 * Returns root nodes (parentId === null or parentId not in set).
 * Deterministic: children at each level are sorted by id.
 */
export function buildTree<T extends HierarchyNode>(nodes: T[]): TreeNode<T>[] {
  const nodeMap = new Map<string, T>();
  const childrenMap = new Map<string, T[]>();

  for (const n of nodes) {
    nodeMap.set(n.id, n);
  }

  // Group children by parentId
  for (const n of nodes) {
    if (n.parentId !== null && nodeMap.has(n.parentId)) {
      if (!childrenMap.has(n.parentId)) {
        childrenMap.set(n.parentId, []);
      }
      childrenMap.get(n.parentId)!.push(n);
    }
  }

  // Sort children deterministically by id
  for (const [, children] of childrenMap) {
    children.sort((a, b) => a.id.localeCompare(b.id));
  }

  function buildSubtree(node: T, depth: number): TreeNode<T> {
    const children = (childrenMap.get(node.id) || []).map((child) =>
      buildSubtree(child, depth + 1),
    );
    return { node, children, depth };
  }

  // Roots: no parentId, or parentId not in the node set
  const roots = nodes
    .filter((n) => n.parentId === null || !nodeMap.has(n.parentId))
    .sort((a, b) => a.id.localeCompare(b.id));

  return roots.map((r) => buildSubtree(r, 0));
}

/**
 * Flatten a tree back into a depth-annotated list (pre-order DFS).
 * Useful for table consumers.
 */
export function flattenTree<T extends HierarchyNode>(
  roots: TreeNode<T>[],
): Array<{ node: T; depth: number }> {
  const result: Array<{ node: T; depth: number }> = [];

  function walk(treeNode: TreeNode<T>) {
    result.push({ node: treeNode.node, depth: treeNode.depth });
    for (const child of treeNode.children) {
      walk(child);
    }
  }

  for (const root of roots) {
    walk(root);
  }

  return result;
}
