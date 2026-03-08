const HIERARCHY_CACHE_PREFIX = "hierarchy:";

export const HIERARCHY_CACHE_TTL_MS = 60_000;
export const MAX_HIERARCHY_CACHE_ENTRIES = 100;

type HierarchyCacheValue = Record<string, unknown>;

interface HierarchyCacheEntry {
  value: HierarchyCacheValue;
  expiresAt: number;
}

const cache = new Map<string, HierarchyCacheEntry>();

function cloneValue<T>(value: T): T {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
}

function pruneExpiredEntries(now: number): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) {
      cache.delete(key);
    }
  }
}

function touchEntry(key: string, entry: HierarchyCacheEntry): void {
  cache.delete(key);
  cache.set(key, entry);
}

function userPrefix(userId: string): string {
  return `${HIERARCHY_CACHE_PREFIX}${userId}:`;
}

export function createHierarchyCacheKey(input: {
  userId: string;
  depth: number;
  priorityId: string | null;
  projectId: string | null;
  flat: boolean;
}): string {
  const params = new URLSearchParams({
    depth: String(input.depth),
    flat: input.flat ? "1" : "0",
    priorityId: input.priorityId ?? "",
    projectId: input.projectId ?? "",
  });

  return `${userPrefix(input.userId)}${params.toString()}`;
}

export function getCachedHierarchy(
  cacheKey: string
): HierarchyCacheValue | null {
  const now = Date.now();
  pruneExpiredEntries(now);

  const entry = cache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= now) {
    cache.delete(cacheKey);
    return null;
  }

  touchEntry(cacheKey, entry);
  return cloneValue(entry.value);
}

export function setCachedHierarchy(
  cacheKey: string,
  value: HierarchyCacheValue
): void {
  const now = Date.now();
  pruneExpiredEntries(now);

  touchEntry(cacheKey, {
    value: cloneValue(value),
    expiresAt: now + HIERARCHY_CACHE_TTL_MS,
  });

  while (cache.size > MAX_HIERARCHY_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (!oldestKey) {
      break;
    }
    cache.delete(oldestKey);
  }
}

export function invalidateHierarchy(userId: string): void {
  const prefix = userPrefix(userId);
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

export function resetHierarchyCache(): void {
  cache.clear();
}
