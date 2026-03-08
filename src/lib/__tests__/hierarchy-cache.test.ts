import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createHierarchyCacheKey,
  getCachedHierarchy,
  HIERARCHY_CACHE_TTL_MS,
  invalidateHierarchy,
  MAX_HIERARCHY_CACHE_ENTRIES,
  resetHierarchyCache,
  setCachedHierarchy,
} from "@/lib/hierarchy-cache";

describe("hierarchy-cache", () => {
  beforeEach(() => {
    vi.useRealTimers();
    resetHierarchyCache();
  });

  it("returns a cloned cached hierarchy entry before TTL expiry", () => {
    const key = createHierarchyCacheKey({
      userId: "user-1",
      depth: 3,
      priorityId: null,
      projectId: null,
      flat: false,
    });

    setCachedHierarchy(key, {
      mode: "tree",
      priorities: [{ id: "priority-1" }],
    });

    const cached = getCachedHierarchy(key);
    expect(cached).toEqual({
      mode: "tree",
      priorities: [{ id: "priority-1" }],
    });

    (cached?.priorities as Array<{ id: string }>).push({ id: "priority-2" });

    expect(getCachedHierarchy(key)).toEqual({
      mode: "tree",
      priorities: [{ id: "priority-1" }],
    });
  });

  it("expires cached entries after the configured TTL", () => {
    vi.useFakeTimers();

    const key = createHierarchyCacheKey({
      userId: "user-1",
      depth: 3,
      priorityId: null,
      projectId: null,
      flat: false,
    });

    setCachedHierarchy(key, { mode: "tree" });
    expect(getCachedHierarchy(key)).toEqual({ mode: "tree" });

    vi.advanceTimersByTime(HIERARCHY_CACHE_TTL_MS + 1);

    expect(getCachedHierarchy(key)).toBeNull();
  });

  it("invalidates all hierarchy entries for a user", () => {
    const userKey = createHierarchyCacheKey({
      userId: "user-1",
      depth: 3,
      priorityId: null,
      projectId: null,
      flat: false,
    });
    const otherUserKey = createHierarchyCacheKey({
      userId: "user-2",
      depth: 3,
      priorityId: null,
      projectId: null,
      flat: false,
    });

    setCachedHierarchy(userKey, { mode: "tree" });
    setCachedHierarchy(otherUserKey, { mode: "tree" });

    invalidateHierarchy("user-1");

    expect(getCachedHierarchy(userKey)).toBeNull();
    expect(getCachedHierarchy(otherUserKey)).toEqual({ mode: "tree" });
  });

  it("evicts the least recently used entry when capacity is exceeded", () => {
    const keys = Array.from(
      { length: MAX_HIERARCHY_CACHE_ENTRIES + 1 },
      (_, index) =>
        createHierarchyCacheKey({
          userId: `user-${index}`,
          depth: 3,
          priorityId: null,
          projectId: null,
          flat: false,
        })
    );

    for (const key of keys.slice(0, MAX_HIERARCHY_CACHE_ENTRIES)) {
      setCachedHierarchy(key, { mode: "tree", key });
    }

    // Refresh the first key so the second one becomes the LRU entry.
    expect(getCachedHierarchy(keys[0])).toEqual({
      mode: "tree",
      key: keys[0],
    });

    setCachedHierarchy(keys[MAX_HIERARCHY_CACHE_ENTRIES], {
      mode: "tree",
      key: keys[MAX_HIERARCHY_CACHE_ENTRIES],
    });

    expect(getCachedHierarchy(keys[0])).toEqual({
      mode: "tree",
      key: keys[0],
    });
    expect(getCachedHierarchy(keys[1])).toBeNull();
    expect(getCachedHierarchy(keys[MAX_HIERARCHY_CACHE_ENTRIES])).toEqual({
      mode: "tree",
      key: keys[MAX_HIERARCHY_CACHE_ENTRIES],
    });
  });
});
