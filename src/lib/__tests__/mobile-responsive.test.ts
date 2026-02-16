/** @vitest-environment jsdom */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type Breakpoint,
  type CardSize,
  type ColumnLayout,
  BREAKPOINT_VALUES,
  getBreakpoint,
  getResponsiveColumns,
  getCardSize,
  isTouchDevice,
} from "@/lib/mobile/responsive-utils";

import {
  type SwipeDirection,
  type TouchGesture,
  MIN_TOUCH_TARGET_PX,
  detectSwipe,
  classifyGesture,
  handleLongPress,
  getTouchTargetSize,
} from "@/lib/mobile/touch-interactions";

import {
  type ConflictType,
  type ConflictStrategy,
  detectConflict,
  resolveWithStrategy,
  mergeChanges,
} from "@/lib/mobile/conflict-resolution";

import {
  type OfflineAction,
  type SyncResult,
  createMemoryStorage,
  setStorage,
  getStorage,
  nextId,
  _resetSeq,
  queueOfflineAction,
  getQueueStatus,
  processSync,
  resolveConflict,
} from "@/lib/mobile/offline-sync";

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as UnknownRecord;
}

/* ------------------------------------------------------------------ */
/*  responsive-utils                                                   */
/* ------------------------------------------------------------------ */
describe("responsive-utils", () => {
  it("returns sm for widths below 640", () => {
    expect(getBreakpoint(320)).toBe("sm");
    expect(getBreakpoint(639)).toBe("sm");
  });

  it("returns sm for widths below 768 (below md breakpoint)", () => {
    expect(getBreakpoint(640)).toBe("sm");
    expect(getBreakpoint(767)).toBe("sm");
  });

  it("returns md for widths 768-1023", () => {
    expect(getBreakpoint(768)).toBe("md");    // exact boundary
    expect(getBreakpoint(1023)).toBe("md");
  });

  it("returns lg for widths 1024-1279", () => {
    expect(getBreakpoint(1024)).toBe("lg");
    expect(getBreakpoint(1279)).toBe("lg");
  });

  it("returns xl for widths >= 1280", () => {
    expect(getBreakpoint(1280)).toBe("xl");
    expect(getBreakpoint(1920)).toBe("xl");
  });

  it("getResponsiveColumns returns 1 column for small screens", () => {
    const layout = getResponsiveColumns(320);
    expect(layout.columns).toBe(1);
    expect(layout.cardSize).toBe("compact");
  });

  it("getResponsiveColumns returns 2 columns for medium screens", () => {
    const layout = getResponsiveColumns(800);
    expect(layout.columns).toBe(2);
    expect(layout.cardSize).toBe("standard");
  });

  it("getResponsiveColumns returns 3 columns for large screens", () => {
    const layout = getResponsiveColumns(1100);
    expect(layout.columns).toBe(3);
    expect(layout.cardSize).toBe("standard");
  });

  it("getResponsiveColumns returns 4 columns for xl screens", () => {
    const layout = getResponsiveColumns(1300);
    expect(layout.columns).toBe(4);
    expect(layout.cardSize).toBe("expanded");
  });

  it("getCardSize delegates to getResponsiveColumns", () => {
    expect(getCardSize(320)).toBe("compact");
    expect(getCardSize(900)).toBe("standard");
    expect(getCardSize(1300)).toBe("expanded");
  });

  it("BREAKPOINT_VALUES align with Tailwind defaults", () => {
    expect(BREAKPOINT_VALUES.sm).toBe(640);
    expect(BREAKPOINT_VALUES.md).toBe(768);
    expect(BREAKPOINT_VALUES.lg).toBe(1024);
    expect(BREAKPOINT_VALUES.xl).toBe(1280);
  });

  it("isTouchDevice returns boolean based on window capabilities", () => {
    const result = isTouchDevice();
    expect(typeof result).toBe("boolean");
  });
});

/* ------------------------------------------------------------------ */
/*  touch-interactions                                                 */
/* ------------------------------------------------------------------ */
describe("touch-interactions", () => {
  it("detects right swipe", () => {
    expect(detectSwipe(0, 0, 50, 0)).toBe("right");
  });

  it("detects left swipe", () => {
    expect(detectSwipe(50, 0, 0, 0)).toBe("left");
  });

  it("detects down swipe", () => {
    expect(detectSwipe(0, 0, 0, 50)).toBe("down");
  });

  it("detects up swipe", () => {
    expect(detectSwipe(0, 50, 0, 0)).toBe("up");
  });

  it("returns null for tiny movements below threshold", () => {
    expect(detectSwipe(0, 0, 5, 5)).toBeNull();
  });

  it("classifyGesture returns swipe for large movement", () => {
    const g = classifyGesture(0, 0, 100, 0, 200);
    expect(g.type).toBe("swipe");
    expect(g.direction).toBe("right");
  });

  it("classifyGesture returns long-press for 500ms+ hold", () => {
    const g = classifyGesture(0, 0, 2, 2, 600);
    expect(g.type).toBe("long-press");
  });

  it("classifyGesture returns tap for quick short touch", () => {
    const g = classifyGesture(0, 0, 2, 2, 100);
    expect(g.type).toBe("tap");
  });

  it("handleLongPress threshold is 500ms", () => {
    expect(handleLongPress(499)).toBe(false);
    expect(handleLongPress(500)).toBe(true);
    expect(handleLongPress(1000)).toBe(true);
  });

  it("MIN_TOUCH_TARGET_PX is 44 (WCAG 2.5.5)", () => {
    expect(MIN_TOUCH_TARGET_PX).toBe(44);
  });

  it("getTouchTargetSize pads small content to 44px", () => {
    const size = getTouchTargetSize(20, 20);
    expect(size.minWidth).toBe(44);
    expect(size.minHeight).toBe(44);
    expect(size.padding).toBeGreaterThan(0);
  });

  it("getTouchTargetSize keeps large content as-is", () => {
    const size = getTouchTargetSize(60, 60);
    expect(size.minWidth).toBe(60);
    expect(size.minHeight).toBe(60);
    expect(size.padding).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  conflict-resolution                                                */
/* ------------------------------------------------------------------ */
describe("conflict-resolution", () => {
  it("detects no-conflict when payloads match", () => {
    expect(detectConflict({ a: 1 }, { a: 1 })).toBe("no-conflict");
  });

  it("detects status-mismatch", () => {
    expect(detectConflict({ status: "open" }, { status: "closed" })).toBe("status-mismatch");
  });

  it("detects field-level conflict for <=2 differing fields", () => {
    expect(detectConflict({ a: 1, b: 2 }, { a: 99, b: 2 })).toBe("field-level");
  });

  it("detects concurrent-edit for >2 differing fields", () => {
    expect(detectConflict({ a: 1, b: 2, c: 3 }, { a: 10, b: 20, c: 30 })).toBe("concurrent-edit");
  });

  it("detects deleted-on-server for empty server payload", () => {
    expect(detectConflict({ a: 1 }, {})).toBe("deleted-on-server");
  });

  it("client-wins preserves server values in _serverOverridden", () => {
    const result = resolveWithStrategy("field-level", "client-wins", { a: 1 }, { a: 2 });
    const serverOverridden = asRecord(asRecord(result)._serverOverridden);
    expect(result.a).toBe(1);
    expect(serverOverridden.a).toBe(2);
  });

  it("server-wins preserves client values in _clientOverridden", () => {
    const result = resolveWithStrategy("field-level", "server-wins", { a: 1 }, { a: 2 });
    const clientOverridden = asRecord(asRecord(result)._clientOverridden);
    expect(result.a).toBe(2);
    expect(clientOverridden.a).toBe(1);
  });

  it("merge strategy combines both and records conflicts", () => {
    const result = mergeChanges({ a: 1, b: "client" }, { a: 1, b: "server", c: 3 });
    const conflicts = asRecord(asRecord(result)._conflicts);
    const conflictB = asRecord(conflicts.b);
    expect(result.a).toBe(1);
    expect(result.b).toBe("client");
    expect(result.c).toBe(3);
    expect(conflictB.server).toBe("server");
  });

  it("manual strategy returns requires-manual flag", () => {
    const result = resolveWithStrategy("concurrent-edit", "manual", { a: 1 }, { a: 2 });
    expect(asRecord(result)._requiresManualResolution).toBe(true);
  });

  it("no-conflict just merges payloads", () => {
    const result = resolveWithStrategy("no-conflict", "client-wins", { a: 1 }, { b: 2 });
    expect(result).toEqual({ a: 1, b: 2 });
  });
});

/* ------------------------------------------------------------------ */
/*  offline-sync                                                       */
/* ------------------------------------------------------------------ */
describe("offline-sync", () => {
  beforeEach(async () => {
    const mem = createMemoryStorage();
    setStorage(mem);
    _resetSeq();
  });

  it("queueOfflineAction creates a pending action", async () => {
    const action = await queueOfflineAction("status-update", { cardId: "c1", status: "done" });
    expect(action.status).toBe("pending");
    expect(action.type).toBe("status-update");
  });

  it("getQueueStatus counts correctly", async () => {
    await queueOfflineAction("field-note", { text: "a" });
    await queueOfflineAction("task-create", { title: "b" });
    const status = await getQueueStatus();
    expect(status.pending).toBe(2);
    expect(status.total).toBe(2);
  });

  it("processSync marks actions synced on success", async () => {
    await queueOfflineAction("status-update", { cardId: "c1" });
    const result = await processSync(async () => ({ ok: true as const }));
    expect(result.synced.length).toBe(1);
    expect(result.conflicts.length).toBe(0);
    expect(result.errors.length).toBe(0);
  });

  it("processSync handles server conflicts", async () => {
    await queueOfflineAction("status-update", { status: "open" });
    const result = await processSync(async () => ({
      ok: false as const,
      conflict: true as const,
      serverValue: { status: "closed" },
    }));
    expect(result.conflicts.length).toBe(1);
    expect(result.conflicts[0].conflictType).toBe("status-mismatch");
  });

  it("processSync records errors and increments retries", async () => {
    await queueOfflineAction("task-create", { title: "x" });
    const result = await processSync(async () => {
      throw new Error("network failure");
    });
    expect(result.errors.length).toBe(1);
    expect(result.errors[0].error).toBe("network failure");
    const all = await getStorage().getAll();
    expect(all[0].retries).toBe(1);
    expect(all[0].status).toBe("pending");
  });

  it("nextId generates sequential IDs", () => {
    _resetSeq();
    const a = nextId();
    const b = nextId();
    expect(a).toContain("offline-");
    expect(a).not.toBe(b);
  });

  it("FIFO ordering: earlier actions sync first", async () => {
    const order: string[] = [];
    await queueOfflineAction("field-note", { seq: 1 });
    await queueOfflineAction("field-note", { seq: 2 });
    await processSync(async (action) => {
      const payload = asRecord(action.payload);
      order.push(String(payload.seq));
      return { ok: true as const };
    });
    expect(order).toEqual(["1", "2"]);
  });

  it("resolveConflict resolves and marks synced", async () => {
    const action = await queueOfflineAction("status-update", { status: "open" });
    const resolution = await resolveConflict(action.id, "client-wins", { status: "closed" });
    expect(resolution.resolved).toBe(true);
    const all = await getStorage().getAll();
    expect(all[0].status).toBe("synced");
  });

  it("resolveConflict throws for unknown action", async () => {
    await expect(resolveConflict("nope", "client-wins", {})).rejects.toThrow("not found");
  });

  it("createMemoryStorage CRUD operations work", async () => {
    const mem = createMemoryStorage();
    const action: OfflineAction = { id: "t1", type: "field-note", payload: {}, timestamp: 1, retries: 0, status: "pending" };
    await mem.put(action);
    expect((await mem.getAll()).length).toBe(1);
    action.status = "synced";
    await mem.put(action);
    expect((await mem.getAll())[0].status).toBe("synced");
    await mem.delete("t1");
    expect((await mem.getAll()).length).toBe(0);
    await mem.put(action);
    await mem.clear();
    expect((await mem.getAll()).length).toBe(0);
  });
});

/* ------------------------------------------------------------------ */
/*  PWA manifest                                                       */
/* ------------------------------------------------------------------ */
describe("PWA manifest", () => {
  it("manifest.json exists and is valid JSON", () => {
    const raw = readFileSync(join(process.cwd(), "public", "manifest.json"), "utf-8");
    const manifest = JSON.parse(raw);
    expect(manifest.name).toBe("WIPGuard");
    expect(manifest.display).toBe("standalone");
  });

  it("manifest includes 192 and 512 icons", () => {
    const raw = readFileSync(join(process.cwd(), "public", "manifest.json"), "utf-8");
    const manifest = asRecord(JSON.parse(raw));
    const icons = Array.isArray(manifest.icons)
      ? (manifest.icons as UnknownRecord[])
      : [];
    const sizes = icons.map((icon) => String(icon.sizes ?? ""));
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
  });

  it("manifest has a maskable icon", () => {
    const raw = readFileSync(join(process.cwd(), "public", "manifest.json"), "utf-8");
    const manifest = asRecord(JSON.parse(raw));
    const icons = Array.isArray(manifest.icons)
      ? (manifest.icons as UnknownRecord[])
      : [];
    const maskable = icons.find((icon) => icon.purpose === "maskable");
    expect(maskable).toBeDefined();
  });
});
