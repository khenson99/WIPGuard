import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

describe("retired Work APIs", () => {
  it("retires task, project, sprint, policy, logbook, and customer-success task endpoints", async () => {
    const { GET: getTasks, POST: createTask } = await import("@/app/api/tasks/route");
    const { GET: getTask, PATCH: updateTask, DELETE: deleteTask } = await import(
      "@/app/api/tasks/[id]/route"
    );
    const { GET: getProjects } = await import("@/app/api/projects/route");
    const { GET: getSprints } = await import("@/app/api/sprints/route");
    const { GET: getPolicy } = await import("@/app/api/policy/route");
    const { GET: getLogbook } = await import("@/app/api/logbook/route");
    const { POST: createLinkedTask } = await import(
      "@/app/api/customer-success/accounts/[accountId]/tasks/route"
    );

    const taskCollection = await getTasks();
    const taskCreate = await createTask(
      new NextRequest("http://localhost/api/tasks", { method: "POST" })
    );
    const taskDetail = await getTask(
      new NextRequest("http://localhost/api/tasks/task_1"),
      { params: Promise.resolve({ id: "task_1" }) }
    );
    const taskUpdate = await updateTask(
      new NextRequest("http://localhost/api/tasks/task_1", { method: "PATCH" }),
      { params: Promise.resolve({ id: "task_1" }) }
    );
    const taskDelete = await deleteTask(
      new NextRequest("http://localhost/api/tasks/task_1", { method: "DELETE" }),
      { params: Promise.resolve({ id: "task_1" }) }
    );
    const projects = await getProjects();
    const sprints = await getSprints();
    const policy = await getPolicy();
    const logbook = await getLogbook();
    const linkedTask = await createLinkedTask(
      new NextRequest("http://localhost/api/customer-success/accounts/account_1/tasks", {
        method: "POST",
      }),
      { params: Promise.resolve({ accountId: "account_1" }) }
    );

    expect(taskCollection.status).toBe(410);
    expect(taskCreate.status).toBe(410);
    expect(taskDetail.status).toBe(410);
    expect(taskUpdate.status).toBe(410);
    expect(taskDelete.status).toBe(410);
    expect(projects.status).toBe(410);
    expect(sprints.status).toBe(410);
    expect(policy.status).toBe(410);
    expect(logbook.status).toBe(410);
    expect(linkedTask.status).toBe(410);

    await expect(taskCollection.json()).resolves.toEqual({
      error: "Tasks have been retired with the Work section.",
    });
    await expect(projects.json()).resolves.toEqual({
      error: "Projects have been retired with the Work section.",
    });
    await expect(sprints.json()).resolves.toEqual({
      error: "Sprints have been retired with the Work section.",
    });
    await expect(policy.json()).resolves.toEqual({
      error: "Policies have been retired with the Work section.",
    });
    await expect(logbook.json()).resolves.toEqual({
      error: "Logbook has been retired with the Work section.",
    });
    await expect(linkedTask.json()).resolves.toEqual({
      error: "Customer success task creation has been retired with the Work section.",
    });
  });
});
