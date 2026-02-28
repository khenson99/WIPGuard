"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardCacheStore } from "@/lib/client/dashboard-cache-store";

interface UseDashboardResourceInput<T> {
  cacheKey: string;
  deps: unknown[];
  load: (input: { signal?: AbortSignal; refresh: boolean }) => Promise<T>;
  getLastUpdatedAt?: (data: T) => string | null;
  mapError?: (error: unknown) => string;
}

export interface DashboardResourceState<T> {
  loading: boolean;
  refreshing: boolean;
  data: T | null;
  error: string | null;
  fromCache: boolean;
  stale: boolean;
  lastUpdatedAt: string | null;
  refresh: () => Promise<void>;
}

function defaultMapError(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return "Failed to load dashboard data.";
}

export function useDashboardResource<T>(input: UseDashboardResourceInput<T>): DashboardResourceState<T> {
  const { cacheKey, deps, load, getLastUpdatedAt, mapError = defaultMapError } = input;

  const readCache = useDashboardCacheStore((state) => state.read);
  const writeCache = useDashboardCacheStore((state) => state.write);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [stale, setStale] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const dataRef = useRef<T | null>(null);
  const loadRef = useRef(load);
  const mapErrorRef = useRef(mapError);
  const getLastUpdatedAtRef = useRef(getLastUpdatedAt);
  const dependencyObjectIdsRef = useRef(new WeakMap<object, number>());
  const nextDependencyObjectIdRef = useRef(1);
  const prevDepsRef = useRef<unknown[]>([]);
  const prevDepsSignatureRef = useRef("");

  let depsSignature: string;
  const prevDeps = prevDepsRef.current;
  if (
    prevDeps.length === deps.length &&
    deps.every((dep, i) => Object.is(dep, prevDeps[i]))
  ) {
    depsSignature = prevDepsSignatureRef.current;
  } else {
    depsSignature = deps
      .map((dep, index) => {
        if (dep !== null && (typeof dep === "object" || typeof dep === "function")) {
          const objectDep = dep as object;
          let depId = dependencyObjectIdsRef.current.get(objectDep);
          if (!depId) {
            depId = nextDependencyObjectIdRef.current;
            nextDependencyObjectIdRef.current += 1;
            dependencyObjectIdsRef.current.set(objectDep, depId);
          }
          return `ref:${index}:${depId}`;
        }
        return `${typeof dep}:${index}:${String(dep)}`;
      })
      .join("|");
    prevDepsRef.current = deps;
    prevDepsSignatureRef.current = depsSignature;
  }

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    mapErrorRef.current = mapError;
  }, [mapError]);

  useEffect(() => {
    getLastUpdatedAtRef.current = getLastUpdatedAt;
  }, [getLastUpdatedAt]);

  const performLoad = useCallback(
    async (opts: { refresh: boolean; signal?: AbortSignal }) => {
      const previousData = dataRef.current;

      if (opts.refresh) {
        setRefreshing(true);
      }

      try {
        const payload = await loadRef.current({ signal: opts.signal, refresh: opts.refresh });
        if (opts.signal?.aborted || !mountedRef.current) return;

        const updatedAt = getLastUpdatedAtRef.current ? getLastUpdatedAtRef.current(payload) : null;
        dataRef.current = payload;
        setData(payload);
        setLastUpdatedAt(updatedAt);
        setError(null);
        setStale(false);
        setFromCache(false);
        writeCache<T>(cacheKey, { data: payload, lastUpdatedAt: updatedAt });
      } catch (loadError) {
        if (opts.signal?.aborted || !mountedRef.current) return;

        const nextError = mapErrorRef.current(loadError);
        setError(nextError);

        if (previousData) {
          dataRef.current = previousData;
          setStale(true);
        } else {
          dataRef.current = null;
          setData(null);
          setStale(false);
        }
      } finally {
        if (opts.signal?.aborted || !mountedRef.current) return;
        setLoading(false);
        if (opts.refresh) {
          setRefreshing(false);
        }
      }
    },
    [cacheKey]
  );

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const cached = readCache<T>(cacheKey);

    if (cached) {
      dataRef.current = cached.data ?? null;
      queueMicrotask(() => {
        if (!active || !mountedRef.current) return;
        setData(cached.data ?? null);
        setLastUpdatedAt(cached.lastUpdatedAt ?? null);
        setFromCache(true);
        setStale(false);
        setError(null);
        setLoading(false);
      });
    } else {
      dataRef.current = null;
      queueMicrotask(() => {
        if (!active || !mountedRef.current) return;
        setData(null);
        setError(null);
        setFromCache(false);
        setStale(false);
        setLastUpdatedAt(null);
        setLoading(true);
      });
    }

    void performLoad({ refresh: false, signal: controller.signal });

    return () => {
      active = false;
      controller.abort();
    };
  }, [cacheKey, depsSignature, performLoad]);

  const refresh = useCallback(async () => {
    await performLoad({ refresh: true });
  }, [performLoad]);

  return useMemo(
    () => ({
      loading,
      refreshing,
      data,
      error,
      fromCache,
      stale,
      lastUpdatedAt,
      refresh,
    }),
    [data, error, fromCache, lastUpdatedAt, loading, refresh, refreshing, stale]
  );
}
