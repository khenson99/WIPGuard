"use client";

/**
 * Client data hook for the Imladris metric dashboards.
 *
 * Ports the state machine from `prototype/app/live.js` + the App shell onto the
 * repo's sessionStorage cache pattern (`@/lib/client/session-cache`):
 *  - render cached model immediately (if present), then refresh in the background
 *  - parallel fetch of the 5 endpoints with timeout (see `loadImladrisData`)
 *  - live-or-error gating: `/metrics` failure or 0 matched metrics => error state
 *  - explicit `?demo` opt-in => demo model, loudly labeled, no network
 *
 * The initial state (demo model or cached-live or loading) is derived in a lazy
 * `useState` initializer so no synchronous setState happens inside an effect;
 * the effect only performs the async refresh.
 *
 * State exposed: `{ status, model, error, endpoint, generatedAt, isRefreshing, retry }`.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { readSessionCache, writeSessionCache } from "@/lib/client/session-cache";
import { buildDemoModel, ENDPOINTS, loadImladrisData } from "./live-adapter";
import type { DataStatus, ImladrisModel } from "./types";

const CACHE_KEY = "imladris.dashboard.model.v1";

interface CachedPayload {
  model: ImladrisModel;
  generatedAt: string | null;
  cachedAt: string;
}

interface InternalState {
  status: DataStatus;
  model: ImladrisModel | null;
  error: string | null;
  generatedAt: string | null;
  isRefreshing: boolean;
}

export interface ImladrisDashboardState {
  status: DataStatus;
  model: ImladrisModel | null;
  error: string | null;
  endpoint: string;
  generatedAt: string | null;
  /** True while a background refresh runs over already-rendered cached data. */
  isRefreshing: boolean;
  retry: () => void;
}

export interface UseImladrisDashboardDataOptions {
  /** When true, skip the network and render the loudly-labeled demo model. */
  demo?: boolean;
}

function initialState(demo: boolean): InternalState {
  if (demo) {
    return { status: "demo", model: buildDemoModel(), error: null, generatedAt: null, isRefreshing: false };
  }
  const cached = readSessionCache<CachedPayload>(CACHE_KEY);
  if (cached?.model) {
    return {
      status: "live",
      model: { ...cached.model, mode: "live" },
      error: null,
      generatedAt: cached.generatedAt,
      isRefreshing: true,
    };
  }
  return { status: "loading", model: null, error: null, generatedAt: null, isRefreshing: false };
}

export function useImladrisDashboardData(
  options: UseImladrisDashboardDataOptions = {},
): ImladrisDashboardState {
  const demo = options.demo ?? false;

  const [reloadToken, setReloadToken] = useState(0);
  const [state, setState] = useState<InternalState>(() => initialState(demo));

  // Re-derive the synchronous initial state whenever the demo flag flips or a
  // retry is requested. This is the React-documented "adjust state when inputs
  // change during render" pattern (the guard compares state values, not refs).
  const [lastInputs, setLastInputs] = useState({ demo, token: reloadToken });
  if (lastInputs.demo !== demo || lastInputs.token !== reloadToken) {
    setLastInputs({ demo, token: reloadToken });
    setState(initialState(demo));
  }

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const retry = useCallback(() => {
    setReloadToken((token) => token + 1);
  }, []);

  useEffect(() => {
    if (demo) return; // demo never touches the network

    const hadCache = !!readSessionCache<CachedPayload>(CACHE_KEY)?.model;
    let cancelled = false;
    void loadImladrisData().then((result) => {
      if (cancelled || !mountedRef.current) return;
      if (result.ok) {
        writeSessionCache<CachedPayload>(CACHE_KEY, {
          model: result.data,
          generatedAt: result.generatedAt,
          cachedAt: new Date().toISOString(),
        });
        setState({
          status: "live",
          model: result.data,
          error: null,
          generatedAt: result.generatedAt,
          isRefreshing: false,
        });
      } else if (!hadCache) {
        // No cache to fall back to: live-or-error => full error screen.
        setState({ status: "error", model: null, error: result.error, generatedAt: null, isRefreshing: false });
      } else {
        // Keep showing cached live data; surface a non-fatal refresh failure.
        setState((prev) => ({ ...prev, error: result.error, isRefreshing: false }));
      }
    });

    return () => {
      cancelled = true;
    };
  }, [demo, reloadToken]);

  return {
    status: state.status,
    model: state.model,
    error: state.error,
    endpoint: ENDPOINTS.metrics,
    generatedAt: state.generatedAt,
    isRefreshing: state.isRefreshing,
    retry,
  };
}
