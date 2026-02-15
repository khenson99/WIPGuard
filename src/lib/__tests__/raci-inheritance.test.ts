import { describe, it, expect } from "vitest";
import {
  buildAncestorChain,
  resolveRaci,
  resolveTaskRaci,
  type RaciNode,
  type RaciUser,
} from "../raci-inheritance";

// ---------- Test helpers ----------

const alice: RaciUser = { id: "u1", name: "Alice", email: "alice@test.com", image: null };
const bob: RaciUser = { id: "u2", name: "Bob", email: "bob@test.com", image: null };
const charlie: RaciUser = { id: "u3", name: "Charlie", email: "charlie@test.com", image: null };
const diana: RaciUser = { id: "u4", name: "Diana", email: "diana@test.com", image: null };

function makeNode(overrides: Partial<RaciNode> & { id: string; name: string; level: RaciNode["level"] }): RaciNode {
  return {
    responsible: [],
    accountable: [],
    consulted: [],
    informed: [],
    ...overrides,
  };
}

// ---------- Tests ----------

describe("RACI Inheritance Engine", () => {
  describe("buildAncestorChain", () => {
    it("returns just the task when it has no parents or project", () => {
      const task = makeNode({ id: "t1", name: "Task 1", level: "task" });
      const chain = buildAncestorChain(task);
      expect(chain).toHaveLength(1);
      expect(chain[0].id).toBe("t1");
    });

    it("includes parent tasks in order", () => {
      const grandparent = makeNode({ id: "t0", name: "Grandparent", level: "task" });
      const parent = makeNode({ id: "t1", name: "Parent", level: "task" });
      const task = makeNode({
        id: "t2",
        name: "Task",
        level: "task",
        parentChain: [parent, grandparent],
      } as RaciNode & { parentChain: RaciNode[] });

      const chain = buildAncestorChain(task);
      expect(chain.map((n) => n.id)).toEqual(["t2", "t1", "t0"]);
    });

    it("includes project after task chain", () => {
      const project = makeNode({ id: "p1", name: "Project", level: "project" });
      const task = makeNode({
        id: "t1",
        name: "Task",
        level: "task",
        project,
      } as RaciNode & { project: RaciNode });

      const chain = buildAncestorChain(task);
      expect(chain.map((n) => n.id)).toEqual(["t1", "p1"]);
    });

    it("includes project parent chain and priority", () => {
      const priority = makeNode({ id: "cp1", name: "Priority", level: "priority" });
      const parentProject = makeNode({ id: "p0", name: "Parent Project", level: "project" });
      const project = {
        ...makeNode({ id: "p1", name: "Project", level: "project" }),
        parentChain: [parentProject],
        priority,
      };
      const task = {
        ...makeNode({ id: "t1", name: "Task", level: "task" }),
        project,
      };

      const chain = buildAncestorChain(task);
      expect(chain.map((n) => n.id)).toEqual(["t1", "p1", "p0", "cp1"]);
    });

    it("full chain: task -> parent task -> project -> parent project -> priority", () => {
      const priority = makeNode({ id: "cp1", name: "Q1 Revenue", level: "priority" });
      const parentProject = makeNode({ id: "p0", name: "Epic", level: "project" });
      const project = {
        ...makeNode({ id: "p1", name: "Feature", level: "project" }),
        parentChain: [parentProject],
        priority,
      };
      const parentTask = makeNode({ id: "t0", name: "Parent Task", level: "task" });
      const task = {
        ...makeNode({ id: "t1", name: "Subtask", level: "task" }),
        parentChain: [parentTask],
        project,
      };

      const chain = buildAncestorChain(task);
      expect(chain.map((n) => n.id)).toEqual(["t1", "t0", "p1", "p0", "cp1"]);
      expect(chain.map((n) => n.level)).toEqual(["task", "task", "project", "project", "priority"]);
    });
  });

  describe("resolveRaci", () => {
    it("returns empty RACI when no ancestor has assignments", () => {
      const chain = [
        makeNode({ id: "t1", name: "Task", level: "task" }),
        makeNode({ id: "p1", name: "Project", level: "project" }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([]);
      expect(result.effective.accountable).toEqual([]);
      expect(result.effective.consulted).toEqual([]);
      expect(result.effective.informed).toEqual([]);
      expect(result.sources.responsible).toBeNull();
      expect(result.sources.accountable).toBeNull();
    });

    it("uses task's own RACI when available", () => {
      const chain = [
        makeNode({ id: "t1", name: "Task", level: "task", responsible: [alice], accountable: [bob] }),
        makeNode({ id: "p1", name: "Project", level: "project", responsible: [charlie] }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.effective.accountable).toEqual([bob]);
      expect(result.sources.responsible).toEqual({ level: "task", id: "t1", name: "Task" });
      expect(result.sources.accountable).toEqual({ level: "task", id: "t1", name: "Task" });
    });

    it("inherits from nearest ancestor (nearest-wins)", () => {
      const chain = [
        makeNode({ id: "t1", name: "Subtask", level: "task" }), // empty
        makeNode({ id: "t0", name: "Parent Task", level: "task", responsible: [alice] }),
        makeNode({ id: "p1", name: "Project", level: "project", responsible: [bob], accountable: [charlie] }),
        makeNode({ id: "cp1", name: "Priority", level: "priority", accountable: [diana] }),
      ];

      const result = resolveRaci(chain);
      // R: inherited from parent task (nearest)
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.sources.responsible).toEqual({ level: "task", id: "t0", name: "Parent Task" });
      // A: inherited from project (nearest with non-empty)
      expect(result.effective.accountable).toEqual([charlie]);
      expect(result.sources.accountable).toEqual({ level: "project", id: "p1", name: "Project" });
    });

    it("each RACI role resolved independently", () => {
      const chain = [
        makeNode({ id: "t1", name: "Task", level: "task", responsible: [alice] }),
        makeNode({ id: "p1", name: "Project", level: "project", accountable: [bob], consulted: [charlie] }),
        makeNode({ id: "cp1", name: "Priority", level: "priority", informed: [diana] }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.sources.responsible?.level).toBe("task");
      expect(result.effective.accountable).toEqual([bob]);
      expect(result.sources.accountable?.level).toBe("project");
      expect(result.effective.consulted).toEqual([charlie]);
      expect(result.sources.consulted?.level).toBe("project");
      expect(result.effective.informed).toEqual([diana]);
      expect(result.sources.informed?.level).toBe("priority");
    });

    it("task-level overrides all ancestors", () => {
      const chain = [
        makeNode({
          id: "t1",
          name: "Task",
          level: "task",
          responsible: [alice],
          accountable: [bob],
          consulted: [charlie],
          informed: [diana],
        }),
        makeNode({
          id: "p1",
          name: "Project",
          level: "project",
          responsible: [bob],
          accountable: [charlie],
          consulted: [diana],
          informed: [alice],
        }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.effective.accountable).toEqual([bob]);
      expect(result.effective.consulted).toEqual([charlie]);
      expect(result.effective.informed).toEqual([diana]);
      // All sourced from task
      expect(result.sources.responsible?.id).toBe("t1");
      expect(result.sources.accountable?.id).toBe("t1");
      expect(result.sources.consulted?.id).toBe("t1");
      expect(result.sources.informed?.id).toBe("t1");
    });

    it("skips ancestors with empty arrays", () => {
      const chain = [
        makeNode({ id: "t2", name: "Subtask", level: "task" }),
        makeNode({ id: "t1", name: "Task", level: "task" }), // also empty
        makeNode({ id: "p1", name: "Project", level: "project", responsible: [alice] }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.sources.responsible?.id).toBe("p1");
    });

    it("handles single-node chain", () => {
      const chain = [
        makeNode({ id: "t1", name: "Task", level: "task", responsible: [alice] }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.sources.responsible?.id).toBe("t1");
    });

    it("handles empty chain", () => {
      const result = resolveRaci([]);
      expect(result.effective.responsible).toEqual([]);
      expect(result.sources.responsible).toBeNull();
    });
  });

  describe("resolveTaskRaci (convenience)", () => {
    it("combines buildAncestorChain + resolveRaci", () => {
      const priority = makeNode({
        id: "cp1",
        name: "Priority",
        level: "priority",
        informed: [diana],
      });
      const project = {
        ...makeNode({
          id: "p1",
          name: "Project",
          level: "project",
          accountable: [bob],
        }),
        parentChain: [] as RaciNode[],
        priority,
      };
      const task = {
        ...makeNode({
          id: "t1",
          name: "Task",
          level: "task",
          responsible: [alice],
        }),
        parentChain: [] as RaciNode[],
        project,
      };

      const result = resolveTaskRaci(task);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.effective.accountable).toEqual([bob]);
      expect(result.effective.informed).toEqual([diana]);
      expect(result.sources.responsible?.level).toBe("task");
      expect(result.sources.accountable?.level).toBe("project");
      expect(result.sources.informed?.level).toBe("priority");
    });
  });

  describe("edge cases", () => {
    it("multiple users in a single role are preserved", () => {
      const chain = [
        makeNode({ id: "p1", name: "Project", level: "project", responsible: [alice, bob] }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice, bob]);
    });

    it("deeply nested hierarchy resolves correctly (5 levels)", () => {
      // Priority -> Project -> SubProject -> Task -> Subtask -> SubSubtask
      const chain = [
        makeNode({ id: "t3", name: "SubSubtask", level: "task" }),
        makeNode({ id: "t2", name: "Subtask", level: "task" }),
        makeNode({ id: "t1", name: "Task", level: "task", consulted: [charlie] }),
        makeNode({ id: "p2", name: "SubProject", level: "project" }),
        makeNode({ id: "p1", name: "Project", level: "project", responsible: [alice] }),
        makeNode({ id: "cp1", name: "Priority", level: "priority", accountable: [bob] }),
      ];

      const result = resolveRaci(chain);
      expect(result.effective.responsible).toEqual([alice]);
      expect(result.sources.responsible?.id).toBe("p1");
      expect(result.effective.accountable).toEqual([bob]);
      expect(result.sources.accountable?.id).toBe("cp1");
      expect(result.effective.consulted).toEqual([charlie]);
      expect(result.sources.consulted?.id).toBe("t1");
    });
  });
});
