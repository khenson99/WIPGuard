import { describe, expect, it, vi } from "vitest";
import { loadOrchestrator } from "../orchestrator-loader";

describe("loadOrchestrator", () => {
  it("loads the first candidate that exports runSync", async () => {
    const runSync = vi.fn();
    const importer = vi.fn(async (modulePath: string) => {
      if (modulePath === "../src/lib/sync/orchestrator") {
        return { runSync };
      }
      throw new Error(`Unexpected import ${modulePath}`);
    });

    await expect(loadOrchestrator(importer)).resolves.toEqual({ runSync });
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("tries the next legacy candidate when a candidate module is absent", async () => {
    const runSync = vi.fn();
    const importer = vi.fn(async (modulePath: string) => {
      if (modulePath === "../src/lib/sync/orchestrator") {
        const error = new Error(`Cannot find module '${modulePath}'`);
        (error as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
        throw error;
      }
      if (modulePath === "../src/lib/cron/sync") {
        return { default: { runSync } };
      }
      throw new Error(`Unexpected import ${modulePath}`);
    });

    await expect(loadOrchestrator(importer)).resolves.toEqual({ runSync });
    expect(importer).toHaveBeenCalledTimes(2);
  });

  it("throws when an existing orchestrator candidate fails during import", async () => {
    const importer = vi.fn(async (modulePath: string) => {
      const error = new Error(`Cannot find module 'missing-dependency' imported from ${modulePath}`);
      (error as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
      throw error;
    });

    await expect(loadOrchestrator(importer)).rejects.toThrow(
      "Cannot load sync orchestrator candidate ../src/lib/sync/orchestrator",
    );
    expect(importer).toHaveBeenCalledTimes(1);
  });

  it("throws when no candidate exports runSync", async () => {
    const importer = vi.fn(async (modulePath: string) => {
      const error = new Error(`Cannot find module '${modulePath}'`);
      (error as NodeJS.ErrnoException).code = "ERR_MODULE_NOT_FOUND";
      throw error;
    });

    await expect(loadOrchestrator(importer)).rejects.toThrow(
      "No sync orchestrator module found",
    );
  });
});
