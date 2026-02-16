import { describe, it, expect } from "vitest";

// ─── In-memory task model for lifecycle integration tests ────────────

type TaskStatus = "BACKLOG" | "QUEUED" | "ACTIVE" | "DONE" | "NOT_DONE";

interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  columnOrder: number;
  createdAt: Date;
  updatedAt: Date;
  completedOn: Date | null;
  assigneeId: string | null;
  classOfService: "standard" | "fixed-date" | "expedite" | "intangible";
}

// Valid status transitions: directed acyclic (forward) flow
const VALID_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  BACKLOG: ["QUEUED", "NOT_DONE"],
  QUEUED: ["ACTIVE", "BACKLOG", "NOT_DONE"],
  ACTIVE: ["DONE", "QUEUED", "NOT_DONE"],
  DONE: [], // terminal
  NOT_DONE: [], // terminal
};

// ─── In-memory board store ───────────────────────────────────────────

class InMemoryBoard {
  private tasks: Map<string, Task> = new Map();
  private wipLimits: Map<TaskStatus, number> = new Map();
  private nextOrder = 0;

  setWipLimit(column: TaskStatus, limit: number) {
    this.wipLimits.set(column, limit);
  }

  createTask(input: Omit<Partial<Task>, "title"> & Pick<Task, "title">): Task {
    const { title, ...overrides } = input;
    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      status: overrides.status ?? "BACKLOG",
      columnOrder: this.nextOrder++,
      createdAt: new Date(),
      updatedAt: new Date(),
      completedOn: null,
      assigneeId: overrides.assigneeId ?? null,
      classOfService: overrides.classOfService ?? "standard",
      ...overrides,
    };
    this.tasks.set(task.id, task);
    return task;
  }

  moveTask(taskId: string, targetStatus: TaskStatus): { ok: boolean; error?: string } {
    const task = this.tasks.get(taskId);
    if (!task) return { ok: false, error: "Task not found" };

    const allowed = VALID_TRANSITIONS[task.status];
    if (!allowed.includes(targetStatus)) {
      return { ok: false, error: `Cannot transition from ${task.status} to ${targetStatus}` };
    }

    // WIP limit enforcement
    const limit = this.wipLimits.get(targetStatus);
    if (limit !== undefined && limit > 0) {
      const count = this.countByStatus(targetStatus);
      if (count >= limit) {
        return { ok: false, error: `WIP limit (${limit}) reached for ${targetStatus}` };
      }
    }

    task.status = targetStatus;
    task.updatedAt = new Date();
    if (targetStatus === "DONE") {
      task.completedOn = new Date();
    }
    return { ok: true };
  }

  getTask(taskId: string): Task | undefined {
    return this.tasks.get(taskId);
  }

  countByStatus(status: TaskStatus): number {
    return [...this.tasks.values()].filter((t) => t.status === status).length;
  }

  allTasks(): Task[] {
    return [...this.tasks.values()];
  }
}

// ─── Tests ───────────────────────────────────────────────────────────

describe("Task Lifecycle Integration", () => {
  describe("create → queued → active → done flow", () => {
    it("creates a task in BACKLOG by default", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Implement feature X" });

      expect(task.status).toBe("BACKLOG");
      expect(task.completedOn).toBeNull();
      expect(task.id).toBeTruthy();
    });

    it("moves a task through the full lifecycle: BACKLOG → QUEUED → ACTIVE → DONE", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Full lifecycle task" });

      expect(board.moveTask(task.id, "QUEUED").ok).toBe(true);
      expect(board.getTask(task.id)!.status).toBe("QUEUED");

      expect(board.moveTask(task.id, "ACTIVE").ok).toBe(true);
      expect(board.getTask(task.id)!.status).toBe("ACTIVE");

      expect(board.moveTask(task.id, "DONE").ok).toBe(true);
      const finalTask = board.getTask(task.id)!;
      expect(finalTask.status).toBe("DONE");
      expect(finalTask.completedOn).toBeInstanceOf(Date);
    });

    it("sets completedOn only when reaching DONE", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Timestamp check" });

      board.moveTask(task.id, "QUEUED");
      expect(board.getTask(task.id)!.completedOn).toBeNull();

      board.moveTask(task.id, "ACTIVE");
      expect(board.getTask(task.id)!.completedOn).toBeNull();

      board.moveTask(task.id, "DONE");
      expect(board.getTask(task.id)!.completedOn).not.toBeNull();
    });

    it("updates the updatedAt timestamp on each transition", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Timestamp tracking" });
      const createdTime = task.updatedAt;

      board.moveTask(task.id, "QUEUED");
      const afterQueued = board.getTask(task.id)!.updatedAt;
      expect(afterQueued.getTime()).toBeGreaterThanOrEqual(createdTime.getTime());
    });
  });

  describe("status transition validation", () => {
    it("prevents direct BACKLOG → DONE transition", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Skip attempt" });

      const result = board.moveTask(task.id, "DONE");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Cannot transition");
    });

    it("prevents direct BACKLOG → ACTIVE transition", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Skip queued" });

      const result = board.moveTask(task.id, "ACTIVE");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Cannot transition");
    });

    it("allows BACKLOG → NOT_DONE (cancellation)", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Cancel from backlog" });

      const result = board.moveTask(task.id, "NOT_DONE");
      expect(result.ok).toBe(true);
      expect(board.getTask(task.id)!.status).toBe("NOT_DONE");
    });

    it("allows ACTIVE → QUEUED (pull-back)", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Pull back" });
      board.moveTask(task.id, "QUEUED");
      board.moveTask(task.id, "ACTIVE");

      const result = board.moveTask(task.id, "QUEUED");
      expect(result.ok).toBe(true);
      expect(board.getTask(task.id)!.status).toBe("QUEUED");
    });

    it("prevents transitions out of DONE (terminal state)", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Completed" });
      board.moveTask(task.id, "QUEUED");
      board.moveTask(task.id, "ACTIVE");
      board.moveTask(task.id, "DONE");

      const result = board.moveTask(task.id, "ACTIVE");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Cannot transition");
    });

    it("prevents transitions out of NOT_DONE (terminal state)", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Cancelled" });
      board.moveTask(task.id, "NOT_DONE");

      const result = board.moveTask(task.id, "BACKLOG");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("Cannot transition");
    });

    it("returns error for nonexistent task", () => {
      const board = new InMemoryBoard();
      const result = board.moveTask("nonexistent", "QUEUED");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("not found");
    });
  });

  describe("WIP limit enforcement during transitions", () => {
    it("blocks transition when ACTIVE column reaches WIP limit", () => {
      const board = new InMemoryBoard();
      board.setWipLimit("ACTIVE", 2);

      const t1 = board.createTask({ title: "Active 1" });
      const t2 = board.createTask({ title: "Active 2" });
      const t3 = board.createTask({ title: "Active 3 (blocked)" });

      board.moveTask(t1.id, "QUEUED");
      board.moveTask(t1.id, "ACTIVE");
      board.moveTask(t2.id, "QUEUED");
      board.moveTask(t2.id, "ACTIVE");

      board.moveTask(t3.id, "QUEUED");
      const result = board.moveTask(t3.id, "ACTIVE");
      expect(result.ok).toBe(false);
      expect(result.error).toContain("WIP limit");
    });

    it("allows transition after completing a WIP-limited task", () => {
      const board = new InMemoryBoard();
      board.setWipLimit("ACTIVE", 1);

      const t1 = board.createTask({ title: "First" });
      const t2 = board.createTask({ title: "Second" });

      board.moveTask(t1.id, "QUEUED");
      board.moveTask(t1.id, "ACTIVE");

      board.moveTask(t2.id, "QUEUED");
      expect(board.moveTask(t2.id, "ACTIVE").ok).toBe(false);

      // Complete the first task to free up space
      board.moveTask(t1.id, "DONE");
      expect(board.moveTask(t2.id, "ACTIVE").ok).toBe(true);
    });

    it("does not enforce WIP limits on BACKLOG or DONE columns", () => {
      const board = new InMemoryBoard();
      // Setting limits of 0 would be "no limit" - don't set them for BACKLOG/DONE
      // Instead, set a limit of 1 on QUEUED and verify BACKLOG and DONE are unlimited
      board.setWipLimit("QUEUED", 1);

      const t1 = board.createTask({ title: "Task 1" });
      const t2 = board.createTask({ title: "Task 2" });

      // BACKLOG has no limit - both can exist there
      expect(board.countByStatus("BACKLOG")).toBe(2);

      // QUEUED is limited to 1
      board.moveTask(t1.id, "QUEUED");
      const result = board.moveTask(t2.id, "QUEUED");
      expect(result.ok).toBe(false);
    });

    it("tracks WIP counts accurately across multiple transitions", () => {
      const board = new InMemoryBoard();
      board.setWipLimit("ACTIVE", 3);

      const tasks = Array.from({ length: 5 }, (_, i) =>
        board.createTask({ title: `Task ${i + 1}` })
      );

      // Move first 3 to ACTIVE
      for (const t of tasks.slice(0, 3)) {
        board.moveTask(t.id, "QUEUED");
        board.moveTask(t.id, "ACTIVE");
      }
      expect(board.countByStatus("ACTIVE")).toBe(3);

      // 4th should be blocked
      board.moveTask(tasks[3].id, "QUEUED");
      expect(board.moveTask(tasks[3].id, "ACTIVE").ok).toBe(false);

      // Complete one, then 4th should succeed
      board.moveTask(tasks[0].id, "DONE");
      expect(board.countByStatus("ACTIVE")).toBe(2);
      expect(board.moveTask(tasks[3].id, "ACTIVE").ok).toBe(true);
    });
  });

  describe("class of service handling", () => {
    it("preserves class of service through transitions", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({
        title: "Expedited fix",
        classOfService: "expedite",
      });

      board.moveTask(task.id, "QUEUED");
      board.moveTask(task.id, "ACTIVE");

      expect(board.getTask(task.id)!.classOfService).toBe("expedite");
    });

    it("defaults to standard class of service", () => {
      const board = new InMemoryBoard();
      const task = board.createTask({ title: "Normal task" });
      expect(task.classOfService).toBe("standard");
    });
  });
});
