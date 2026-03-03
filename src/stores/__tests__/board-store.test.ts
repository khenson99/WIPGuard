import { useBoardStore } from "../board-store";
import type { Task } from "@/types/board";

// Reset the store between tests
beforeEach(() => {
  const store = useBoardStore.getState();
  store.setTasks([]);
  store.setColumns({});
  store.setLoading(false);
  store.setError(null);
});

const mockTask = (overrides: Partial<Task> = {}): Task => ({
  id: "task-1",
  title: "Test Task",
  status: "ACTIVE",
  order: 0,
  projectId: "proj-1",
  ...overrides,
} as Task);

describe("board-store optimistic updates", () => {
  describe("updateTaskInPlace", () => {
    it("should update an existing task by id", () => {
      const store = useBoardStore.getState();
      store.setTasks([mockTask(), mockTask({ id: "task-2", title: "Other" })]);

      store.updateTaskInPlace(mockTask({ title: "Updated Title" }));

      const state = useBoardStore.getState();
      expect(state.tasks).toHaveLength(2);
      expect(state.tasks.find((t) => t.id === "task-1")?.title).toBe(
        "Updated Title"
      );
      expect(state.tasks.find((t) => t.id === "task-2")?.title).toBe("Other");
    });

    it("should append the task if it does not exist", () => {
      const store = useBoardStore.getState();
      store.setTasks([mockTask()]);

      store.updateTaskInPlace(mockTask({ id: "task-new", title: "New Task" }));

      const state = useBoardStore.getState();
      expect(state.tasks).toHaveLength(2);
      expect(state.tasks.find((t) => t.id === "task-new")?.title).toBe(
        "New Task"
      );
    });
  });

  describe("removeTaskInPlace", () => {
    it("should remove a task by id", () => {
      const store = useBoardStore.getState();
      store.setTasks([mockTask(), mockTask({ id: "task-2" })]);

      store.removeTaskInPlace("task-1");

      const state = useBoardStore.getState();
      expect(state.tasks).toHaveLength(1);
      expect(state.tasks[0].id).toBe("task-2");
    });

    it("should remove the task id from column taskIds arrays", () => {
      const store = useBoardStore.getState();
      store.setTasks([mockTask()]);
      store.setColumns({
        ACTIVE: { id: "ACTIVE", title: "Active", taskIds: ["task-1", "task-2"] } as any,
        DONE: { id: "DONE", title: "Done", taskIds: ["task-3"] } as any,
      });

      store.removeTaskInPlace("task-1");

      const state = useBoardStore.getState();
      expect(state.columns.ACTIVE.taskIds).toEqual(["task-2"]);
      expect(state.columns.DONE.taskIds).toEqual(["task-3"]);
    });

    it("should be a no-op if the task does not exist", () => {
      const store = useBoardStore.getState();
      store.setTasks([mockTask()]);

      store.removeTaskInPlace("nonexistent");

      expect(useBoardStore.getState().tasks).toHaveLength(1);
    });
  });

  describe("addTaskInPlace", () => {
    it("should add a new task", () => {
      const store = useBoardStore.getState();
      store.setTasks([]);

      store.addTaskInPlace(mockTask());

      expect(useBoardStore.getState().tasks).toHaveLength(1);
      expect(useBoardStore.getState().tasks[0].id).toBe("task-1");
    });

    it("should not duplicate a task that already exists", () => {
      const store = useBoardStore.getState();
      store.setTasks([mockTask()]);

      store.addTaskInPlace(mockTask());

      expect(useBoardStore.getState().tasks).toHaveLength(1);
    });
  });

  describe("reorderColumnInPlace", () => {
    it("should update the taskIds for specified columns", () => {
      const store = useBoardStore.getState();
      store.setColumns({
        ACTIVE: { id: "ACTIVE", title: "Active", taskIds: ["task-1", "task-2", "task-3"] } as any,
        QUEUED: { id: "QUEUED", title: "Queued", taskIds: ["task-4"] } as any,
      });

      store.reorderColumnInPlace({
        ACTIVE: ["task-3", "task-1", "task-2"],
      });

      const state = useBoardStore.getState();
      expect(state.columns.ACTIVE.taskIds).toEqual([
        "task-3",
        "task-1",
        "task-2",
      ]);
      // Unaffected column should remain unchanged
      expect(state.columns.QUEUED.taskIds).toEqual(["task-4"]);
    });

    it("should handle reordering across multiple columns", () => {
      const store = useBoardStore.getState();
      store.setColumns({
        ACTIVE: { id: "ACTIVE", title: "Active", taskIds: ["task-1", "task-2"] } as any,
        DONE: { id: "DONE", title: "Done", taskIds: ["task-3"] } as any,
      });

      // task-2 moved from ACTIVE to DONE
      store.reorderColumnInPlace({
        ACTIVE: ["task-1"],
        DONE: ["task-3", "task-2"],
      });

      const state = useBoardStore.getState();
      expect(state.columns.ACTIVE.taskIds).toEqual(["task-1"]);
      expect(state.columns.DONE.taskIds).toEqual(["task-3", "task-2"]);
    });

    it("should ignore columns not present in the store", () => {
      const store = useBoardStore.getState();
      store.setColumns({
        ACTIVE: { id: "ACTIVE", title: "Active", taskIds: ["task-1"] } as any,
      });

      // NONEXISTENT column in payload should not cause an error
      store.reorderColumnInPlace({
        NONEXISTENT: ["task-99"],
      });

      const state = useBoardStore.getState();
      expect(state.columns.ACTIVE.taskIds).toEqual(["task-1"]);
      expect(state.columns.NONEXISTENT).toBeUndefined();
    });
  });
});
