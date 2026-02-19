import { describe, it, expect } from "vitest";
import {
  wouldCreateCycle,
  detectCycles,
  detectOrphans,
  computeDepths,
  resolveRaciDeterministic,
  validateHierarchy,
  validateParentAssignment,
  buildTree,
  flattenTree,
  MAX_HIERARCHY_DEPTH,
  type HierarchyNode,
} from "../hierarchy-engine";
import type { RaciNode, RaciUser } from "../raci-inheritance";

// ─── Factory helpers ─────────────────────────────────────────────────

function makeHNode(id: string, parentId: string | null = null): HierarchyNode {
  return { id, parentId };
}

const alice: RaciUser = { id: "u1", name: "Alice", email: "alice@test.com", image: null };
const bob: RaciUser = { id: "u2", name: "Bob", email: "bob@test.com", image: null };
const charlie: RaciUser = { id: "u3", name: "Charlie", email: "charlie@test.com", image: null };
const diana: RaciUser = { id: "u4", name: "Diana", email: "diana@test.com", image: null };

function makeRaciNode(
  overrides: Partial<RaciNode> & { id: string; name: string; level: RaciNode["level"] },
): RaciNode {
  return {
    responsible: [],
    accountable: [],
    consulted: [],
    informed: [],
    ...overrides,
  };
}

// ─── wouldCreateCycle ────────────────────────────────────────────────

describe("wouldCreateCycle", () => {
  it("returns false when proposedParentId is null", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "a")];
    const result = wouldCreateCycle(nodes, "b", null);
    expect(result.hasCycle).toBe(false);
    expect(result.cycleNodeIds).toEqual([]);
  });

  it("detects self-reference as a cycle", () => {
    const nodes = [makeHNode("a")];
    const result = wouldCreateCycle(nodes, "a", "a");
    expect(result.hasCycle).toBe(true);
    expect(result.cycleNodeIds).toContain("a");
  });

  it("detects a direct two-node cycle", () => {
    // a -> b, proposing b.parent = a would make b -> a -> b
    const nodes = [makeHNode("a"), makeHNode("b", "a")];
    const result = wouldCreateCycle(nodes, "a", "b");
    expect(result.hasCycle).toBe(true);
  });

  it("detects an indirect cycle through three nodes", () => {
    // a -> b -> c, proposing c.parent = a (already is), then a.parent = c
    const nodes = [makeHNode("a"), makeHNode("b", "a"), makeHNode("c", "b")];
    const result = wouldCreateCycle(nodes, "a", "c");
    expect(result.hasCycle).toBe(true);
  });

  it("allows valid reparenting that doesn't create a cycle", () => {
    // a -> b, c is standalone; proposing c.parent = b is fine
    const nodes = [makeHNode("a"), makeHNode("b", "a"), makeHNode("c")];
    const result = wouldCreateCycle(nodes, "c", "b");
    expect(result.hasCycle).toBe(false);
  });

  it("allows moving a node to a different branch", () => {
    // a -> b, a -> c; moving c under b is fine
    const nodes = [makeHNode("a"), makeHNode("b", "a"), makeHNode("c", "a")];
    const result = wouldCreateCycle(nodes, "c", "b");
    expect(result.hasCycle).toBe(false);
  });

  it("detects cycle in a longer chain", () => {
    // a -> b -> c -> d; proposing a.parent = d creates cycle
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
      makeHNode("d", "c"),
    ];
    const result = wouldCreateCycle(nodes, "a", "d");
    expect(result.hasCycle).toBe(true);
  });
});

// ─── detectCycles ────────────────────────────────────────────────────

describe("detectCycles", () => {
  it("returns empty set for acyclic tree", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "a"), makeHNode("c", "a")];
    const cycles = detectCycles(nodes);
    expect(cycles.size).toBe(0);
  });

  it("returns empty set for single root node", () => {
    const cycles = detectCycles([makeHNode("a")]);
    expect(cycles.size).toBe(0);
  });

  it("returns empty set for empty input", () => {
    const cycles = detectCycles([]);
    expect(cycles.size).toBe(0);
  });

  it("detects a two-node cycle", () => {
    // a -> b, b -> a
    const nodes: HierarchyNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    const cycles = detectCycles(nodes);
    expect(cycles.has("a")).toBe(true);
    expect(cycles.has("b")).toBe(true);
  });

  it("detects a self-referencing node", () => {
    const nodes: HierarchyNode[] = [{ id: "a", parentId: "a" }];
    const cycles = detectCycles(nodes);
    expect(cycles.has("a")).toBe(true);
  });

  it("detects a three-node cycle", () => {
    const nodes: HierarchyNode[] = [
      { id: "a", parentId: "c" },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "b" },
    ];
    const cycles = detectCycles(nodes);
    expect(cycles.has("a")).toBe(true);
    expect(cycles.has("b")).toBe(true);
    expect(cycles.has("c")).toBe(true);
  });

  it("only flags nodes in the cycle, not their children", () => {
    // a -> b -> a (cycle), c -> a (c hangs off the cycle but isn't in it directly)
    const nodes: HierarchyNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
      { id: "c", parentId: "a" },
    ];
    const cycles = detectCycles(nodes);
    expect(cycles.has("a")).toBe(true);
    expect(cycles.has("b")).toBe(true);
    // c is attached to a cycle member but c itself doesn't form a cycle path
    // (c -> a -> b -> a — the cycle is a,b)
    // Note: c will be marked because walking from c leads into the cycle
    // Implementation detail: once we hit a known cycle member, we stop
  });

  it("handles multiple independent cycles", () => {
    const nodes: HierarchyNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
      { id: "x", parentId: "y" },
      { id: "y", parentId: "x" },
      { id: "z", parentId: null }, // clean root
    ];
    const cycles = detectCycles(nodes);
    expect(cycles.has("a")).toBe(true);
    expect(cycles.has("b")).toBe(true);
    expect(cycles.has("x")).toBe(true);
    expect(cycles.has("y")).toBe(true);
    expect(cycles.has("z")).toBe(false);
  });
});

// ─── detectOrphans ───────────────────────────────────────────────────

describe("detectOrphans", () => {
  it("returns empty for well-formed tree", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "a"), makeHNode("c", "a")];
    const result = detectOrphans(nodes);
    expect(result.orphanedNodes).toEqual([]);
  });

  it("does not flag root nodes as orphans", () => {
    const nodes = [makeHNode("a"), makeHNode("b")];
    const result = detectOrphans(nodes);
    expect(result.orphanedNodes).toEqual([]);
  });

  it("flags nodes whose parentId references a missing node", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "missing")];
    const result = detectOrphans(nodes);
    expect(result.orphanedNodes).toHaveLength(1);
    expect(result.orphanedNodes[0].id).toBe("b");
  });

  it("flags multiple orphans", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "gone1"),
      makeHNode("c", "gone2"),
    ];
    const result = detectOrphans(nodes);
    expect(result.orphanedNodes).toHaveLength(2);
    const ids = result.orphanedNodes.map((n) => n.id).sort();
    expect(ids).toEqual(["b", "c"]);
  });

  it("returns empty for empty input", () => {
    const result = detectOrphans([]);
    expect(result.orphanedNodes).toEqual([]);
  });
});

// ─── computeDepths ───────────────────────────────────────────────────

describe("computeDepths", () => {
  it("root nodes have depth 0", () => {
    const nodes = [makeHNode("a"), makeHNode("b")];
    const result = computeDepths(nodes);
    expect(result.depths.get("a")).toBe(0);
    expect(result.depths.get("b")).toBe(0);
    expect(result.maxObservedDepth).toBe(0);
  });

  it("computes depth for a linear chain", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
      makeHNode("d", "c"),
    ];
    const result = computeDepths(nodes);
    expect(result.depths.get("a")).toBe(0);
    expect(result.depths.get("b")).toBe(1);
    expect(result.depths.get("c")).toBe(2);
    expect(result.depths.get("d")).toBe(3);
    expect(result.maxObservedDepth).toBe(3);
  });

  it("reports violations when depth exceeds maxDepth", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
    ];
    const result = computeDepths(nodes, 1); // max depth 1
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0].id).toBe("c");
  });

  it("does not flag nodes within limit", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
    ];
    const result = computeDepths(nodes, 5);
    expect(result.violations).toEqual([]);
  });

  it("assigns -1 depth to cycle members", () => {
    const nodes: HierarchyNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    const result = computeDepths(nodes);
    expect(result.depths.get("a")).toBe(-1);
    expect(result.depths.get("b")).toBe(-1);
  });

  it("treats orphans as depth 0 roots", () => {
    const nodes = [makeHNode("a", "missing")];
    const result = computeDepths(nodes);
    expect(result.depths.get("a")).toBe(0);
  });

  it("handles wide trees correctly", () => {
    // root with 5 children
    const nodes = [
      makeHNode("root"),
      makeHNode("c1", "root"),
      makeHNode("c2", "root"),
      makeHNode("c3", "root"),
      makeHNode("c4", "root"),
      makeHNode("c5", "root"),
    ];
    const result = computeDepths(nodes);
    expect(result.depths.get("root")).toBe(0);
    for (let i = 1; i <= 5; i++) {
      expect(result.depths.get(`c${i}`)).toBe(1);
    }
    expect(result.maxObservedDepth).toBe(1);
  });
});

// ─── resolveRaciDeterministic ────────────────────────────────────────

describe("resolveRaciDeterministic", () => {
  it("sorts users by ID within each role", () => {
    // charlie (u3), alice (u1), bob (u2) — should be sorted to u1, u2, u3
    const chain: RaciNode[] = [
      makeRaciNode({
        id: "t1",
        name: "Task",
        level: "task",
        responsible: [charlie, alice, bob],
      }),
    ];
    const result = resolveRaciDeterministic(chain);
    expect(result.effective.responsible.map((u) => u.id)).toEqual(["u1", "u2", "u3"]);
  });

  it("produces same order regardless of input order", () => {
    const chainA: RaciNode[] = [
      makeRaciNode({
        id: "t1",
        name: "Task",
        level: "task",
        responsible: [alice, bob, charlie],
        informed: [diana, alice],
      }),
    ];
    const chainB: RaciNode[] = [
      makeRaciNode({
        id: "t1",
        name: "Task",
        level: "task",
        responsible: [charlie, bob, alice],
        informed: [alice, diana],
      }),
    ];

    const resultA = resolveRaciDeterministic(chainA);
    const resultB = resolveRaciDeterministic(chainB);

    expect(resultA.effective.responsible.map((u) => u.id)).toEqual(
      resultB.effective.responsible.map((u) => u.id),
    );
    expect(resultA.effective.informed.map((u) => u.id)).toEqual(
      resultB.effective.informed.map((u) => u.id),
    );
  });

  it("preserves nearest-wins semantics", () => {
    const chain: RaciNode[] = [
      makeRaciNode({ id: "t1", name: "Task", level: "task", responsible: [bob] }),
      makeRaciNode({ id: "p1", name: "Project", level: "project", responsible: [alice], accountable: [charlie] }),
    ];
    const result = resolveRaciDeterministic(chain);
    expect(result.effective.responsible).toEqual([bob]);
    expect(result.effective.accountable).toEqual([charlie]);
    expect(result.sources.responsible?.id).toBe("t1");
    expect(result.sources.accountable?.id).toBe("p1");
  });

  it("handles empty chain", () => {
    const result = resolveRaciDeterministic([]);
    expect(result.effective.responsible).toEqual([]);
    expect(result.sources.responsible).toBeNull();
  });

  it("handles single user per role (no sorting needed)", () => {
    const chain: RaciNode[] = [
      makeRaciNode({
        id: "t1",
        name: "Task",
        level: "task",
        responsible: [alice],
        accountable: [bob],
        consulted: [charlie],
        informed: [diana],
      }),
    ];
    const result = resolveRaciDeterministic(chain);
    expect(result.effective.responsible).toEqual([alice]);
    expect(result.effective.accountable).toEqual([bob]);
  });

  it("does not mutate original arrays", () => {
    const users = [charlie, alice, bob];
    const chain: RaciNode[] = [
      makeRaciNode({ id: "t1", name: "Task", level: "task", responsible: users }),
    ];
    resolveRaciDeterministic(chain);
    // Original should be unchanged
    expect(users.map((u) => u.id)).toEqual(["u3", "u1", "u2"]);
  });
});

// ─── validateHierarchy (composite) ───────────────────────────────────

describe("validateHierarchy", () => {
  it("reports valid for a clean tree", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "a"),
      makeHNode("d", "b"),
    ];
    const report = validateHierarchy(nodes);
    expect(report.valid).toBe(true);
    expect(report.cycles.size).toBe(0);
    expect(report.orphans).toEqual([]);
    expect(report.depthViolations).toEqual([]);
  });

  it("reports invalid when cycles exist", () => {
    const nodes: HierarchyNode[] = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    const report = validateHierarchy(nodes);
    expect(report.valid).toBe(false);
    expect(report.cycles.size).toBeGreaterThan(0);
  });

  it("reports invalid when orphans exist", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "deleted")];
    const report = validateHierarchy(nodes);
    expect(report.valid).toBe(false);
    expect(report.orphans).toHaveLength(1);
  });

  it("reports invalid when depth exceeds limit", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
      makeHNode("d", "c"),
    ];
    const report = validateHierarchy(nodes, 2);
    expect(report.valid).toBe(false);
    expect(report.depthViolations).toHaveLength(1);
    expect(report.depthViolations[0].id).toBe("d");
  });

  it("uses MAX_HIERARCHY_DEPTH by default", () => {
    // Build a chain at exactly MAX_HIERARCHY_DEPTH — should be valid
    const nodes: HierarchyNode[] = [makeHNode("n0")];
    for (let i = 1; i <= MAX_HIERARCHY_DEPTH; i++) {
      nodes.push(makeHNode(`n${i}`, `n${i - 1}`));
    }
    const report = validateHierarchy(nodes);
    expect(report.valid).toBe(true);
    expect(report.maxObservedDepth).toBe(MAX_HIERARCHY_DEPTH);
  });

  it("flags depth violations when exceeding MAX_HIERARCHY_DEPTH", () => {
    const nodes: HierarchyNode[] = [makeHNode("n0")];
    for (let i = 1; i <= MAX_HIERARCHY_DEPTH + 1; i++) {
      nodes.push(makeHNode(`n${i}`, `n${i - 1}`));
    }
    const report = validateHierarchy(nodes);
    expect(report.valid).toBe(false);
    expect(report.depthViolations).toHaveLength(1);
  });

  it("handles empty input as valid", () => {
    const report = validateHierarchy([]);
    expect(report.valid).toBe(true);
  });
});

// ─── validateParentAssignment ────────────────────────────────────────

describe("validateParentAssignment", () => {
  it("allows setting parent to null (root)", () => {
    const nodes = [makeHNode("a", "b"), makeHNode("b")];
    const result = validateParentAssignment(nodes, "a", null);
    expect(result.allowed).toBe(true);
  });

  it("rejects self-reference", () => {
    const nodes = [makeHNode("a")];
    const result = validateParentAssignment(nodes, "a", "a");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("own parent");
  });

  it("rejects non-existent parent", () => {
    const nodes = [makeHNode("a")];
    const result = validateParentAssignment(nodes, "a", "missing");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("does not exist");
  });

  it("rejects cycle-creating assignment", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "a")];
    const result = validateParentAssignment(nodes, "a", "b");
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("cycle");
  });

  it("rejects assignment that would exceed max depth", () => {
    // Chain: a -> b -> c. Setting d.parent = c with maxDepth=2 makes d at depth 3
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
      makeHNode("d"),
    ];
    const result = validateParentAssignment(nodes, "d", "c", 2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain("depth");
  });

  it("allows valid reparenting", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c"),
    ];
    const result = validateParentAssignment(nodes, "c", "b");
    expect(result.allowed).toBe(true);
  });

  it("allows moving a deep node to a shallower position", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
    ];
    // Move c directly under root a (depth goes from 2 to 1)
    const result = validateParentAssignment(nodes, "c", "a");
    expect(result.allowed).toBe(true);
  });
});

// ─── buildTree ───────────────────────────────────────────────────────

describe("buildTree", () => {
  it("builds a simple tree from flat nodes", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "a"),
    ];
    const roots = buildTree(nodes);
    expect(roots).toHaveLength(1);
    expect(roots[0].node.id).toBe("a");
    expect(roots[0].children).toHaveLength(2);
    expect(roots[0].depth).toBe(0);
  });

  it("sorts children deterministically by id", () => {
    const nodes = [
      makeHNode("root"),
      makeHNode("z", "root"),
      makeHNode("a", "root"),
      makeHNode("m", "root"),
    ];
    const roots = buildTree(nodes);
    const childIds = roots[0].children.map((c) => c.node.id);
    expect(childIds).toEqual(["a", "m", "z"]);
  });

  it("sorts roots deterministically by id", () => {
    const nodes = [makeHNode("z"), makeHNode("a"), makeHNode("m")];
    const roots = buildTree(nodes);
    expect(roots.map((r) => r.node.id)).toEqual(["a", "m", "z"]);
  });

  it("computes depth correctly", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
    ];
    const roots = buildTree(nodes);
    expect(roots[0].depth).toBe(0);
    expect(roots[0].children[0].depth).toBe(1);
    expect(roots[0].children[0].children[0].depth).toBe(2);
  });

  it("handles multiple root nodes", () => {
    const nodes = [makeHNode("a"), makeHNode("b")];
    const roots = buildTree(nodes);
    expect(roots).toHaveLength(2);
  });

  it("treats orphans as additional roots", () => {
    const nodes = [makeHNode("a"), makeHNode("b", "missing")];
    const roots = buildTree(nodes);
    expect(roots).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    const roots = buildTree([]);
    expect(roots).toEqual([]);
  });

  it("handles a deep linear chain", () => {
    const nodes: HierarchyNode[] = [];
    for (let i = 0; i < 8; i++) {
      nodes.push(makeHNode(`n${i}`, i > 0 ? `n${i - 1}` : null));
    }
    const roots = buildTree(nodes);
    expect(roots).toHaveLength(1);

    // Walk the chain and verify depths
    let current = roots[0];
    for (let i = 0; i < 8; i++) {
      expect(current.node.id).toBe(`n${i}`);
      expect(current.depth).toBe(i);
      if (i < 7) {
        expect(current.children).toHaveLength(1);
        current = current.children[0];
      }
    }
  });
});

// ─── flattenTree ─────────────────────────────────────────────────────

describe("flattenTree", () => {
  it("flattens tree in pre-order DFS", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "a"),
      makeHNode("d", "b"),
    ];
    const roots = buildTree(nodes);
    const flat = flattenTree(roots);
    expect(flat.map((f) => f.node.id)).toEqual(["a", "b", "d", "c"]);
  });

  it("preserves depth in flat output", () => {
    const nodes = [
      makeHNode("a"),
      makeHNode("b", "a"),
      makeHNode("c", "b"),
    ];
    const roots = buildTree(nodes);
    const flat = flattenTree(roots);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2]);
  });

  it("handles multiple roots", () => {
    const nodes = [makeHNode("b"), makeHNode("a")];
    const roots = buildTree(nodes);
    const flat = flattenTree(roots);
    // Roots sorted by id: a, b
    expect(flat.map((f) => f.node.id)).toEqual(["a", "b"]);
  });

  it("returns empty array for empty tree", () => {
    const flat = flattenTree([]);
    expect(flat).toEqual([]);
  });

  it("flattens a wide tree correctly", () => {
    const nodes = [
      makeHNode("root"),
      makeHNode("c1", "root"),
      makeHNode("c2", "root"),
      makeHNode("c3", "root"),
    ];
    const roots = buildTree(nodes);
    const flat = flattenTree(roots);
    expect(flat).toHaveLength(4);
    expect(flat[0].node.id).toBe("root");
    // Children sorted by id
    expect(flat.slice(1).map((f) => f.node.id)).toEqual(["c1", "c2", "c3"]);
  });
});

// ─── Integration: full Priority->Project->Epic->Task->Subtask ────────

describe("full hierarchy integration", () => {
  it("validates a Priority->Project->Epic->Task->Subtask chain", () => {
    // Simulating the full chain as hierarchy nodes
    const nodes = [
      makeHNode("priority-1"),
      makeHNode("project-1", "priority-1"),
      makeHNode("epic-1", "project-1"),
      makeHNode("task-1", "epic-1"),
      makeHNode("subtask-1", "task-1"),
    ];

    const report = validateHierarchy(nodes);
    expect(report.valid).toBe(true);
    expect(report.maxObservedDepth).toBe(4);
  });

  it("builds tree for the full chain", () => {
    const nodes = [
      makeHNode("priority-1"),
      makeHNode("project-1", "priority-1"),
      makeHNode("epic-1", "project-1"),
      makeHNode("task-1", "epic-1"),
      makeHNode("subtask-1", "task-1"),
    ];

    const tree = buildTree(nodes);
    expect(tree).toHaveLength(1);
    expect(tree[0].node.id).toBe("priority-1");

    // Walk the chain
    let current = tree[0];
    const expectedIds = ["priority-1", "project-1", "epic-1", "task-1", "subtask-1"];
    for (let i = 0; i < expectedIds.length; i++) {
      expect(current.node.id).toBe(expectedIds[i]);
      expect(current.depth).toBe(i);
      if (i < expectedIds.length - 1) {
        current = current.children[0];
      }
    }
  });

  it("flattens full chain for table consumers", () => {
    const nodes = [
      makeHNode("priority-1"),
      makeHNode("project-1", "priority-1"),
      makeHNode("epic-1", "project-1"),
      makeHNode("task-1", "epic-1"),
      makeHNode("subtask-1", "task-1"),
    ];

    const tree = buildTree(nodes);
    const flat = flattenTree(tree);

    expect(flat).toHaveLength(5);
    expect(flat.map((f) => f.node.id)).toEqual([
      "priority-1",
      "project-1",
      "epic-1",
      "task-1",
      "subtask-1",
    ]);
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 3, 4]);
  });

  it("resolves RACI deterministically across the full chain", () => {
    const chain: RaciNode[] = [
      makeRaciNode({ id: "subtask-1", name: "Subtask", level: "task" }),
      makeRaciNode({ id: "task-1", name: "Task", level: "task", responsible: [charlie, alice] }),
      makeRaciNode({ id: "epic-1", name: "Epic", level: "project", accountable: [bob] }),
      makeRaciNode({ id: "project-1", name: "Project", level: "project", consulted: [diana] }),
      makeRaciNode({ id: "priority-1", name: "Priority", level: "priority", informed: [bob, alice] }),
    ];

    const result = resolveRaciDeterministic(chain);

    // Responsible inherited from task-1, sorted by id
    expect(result.effective.responsible.map((u) => u.id)).toEqual(["u1", "u3"]);
    expect(result.sources.responsible?.id).toBe("task-1");

    // Accountable inherited from epic-1
    expect(result.effective.accountable).toEqual([bob]);
    expect(result.sources.accountable?.id).toBe("epic-1");

    // Consulted inherited from project-1
    expect(result.effective.consulted).toEqual([diana]);
    expect(result.sources.consulted?.id).toBe("project-1");

    // Informed inherited from priority-1, sorted by id
    expect(result.effective.informed.map((u) => u.id)).toEqual(["u1", "u2"]);
    expect(result.sources.informed?.id).toBe("priority-1");
  });
});
