import { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager } from "react-native";
import { useFocusEffect } from "expo-router";

import { focusPerfMark, focusPerfStart } from "@/lib/perfFocus";
import {
  cacheAgeMs,
  getCachedResource,
  peekCachedResource,
  setCachedResource,
} from "@/lib/resourceCache";

type Options = {
  /** Serve cached data when younger than this (ms). Default 5 min. */
  staleMs?: number;
  /** Background refresh when screen gains focus if cache is older than this. Default 45s. */
  focusRefreshAfterMs?: number;
  /** Skip focus-driven refresh (mount + manual only). */
  disableFocusRefresh?: boolean;
};

/**
 * Stale-while-revalidate fetch: show cache immediately, refresh in background after focus/mount.
 * Defers focus refetch until after navigation transitions (InteractionManager).
 */
export function useScreenResource<T>(
  cacheKey: string,
  fetcher: () => Promise<T>,
  options?: Options
) {
  const staleMs = options?.staleMs ?? 5 * 60_000;
  const focusRefreshAfterMs = options?.focusRefreshAfterMs ?? 45_000;
  const disableFocusRefresh = options?.disableFocusRefresh ?? false;

  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const [data, setData] = useState<T | null>(() => peekCachedResource<T>(cacheKey));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => peekCachedResource<T>(cacheKey) == null);
  const [refreshing, setRefreshing] = useState(false);
  const inFlightRef = useRef(false);

  const runFetch = useCallback(
    async (mode: "initial" | "background" | "manual") => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      const hasCache = peekCachedResource<T>(cacheKey) != null;
      const endPerf =
        mode === "initial" ? focusPerfStart(`${cacheKey}:fetch`) : () => {};

      if (mode === "manual" || (mode === "initial" && !hasCache)) {
        setLoading(true);
      } else if (mode === "background") {
        setRefreshing(true);
      }

      try {
        const fresh = await fetcherRef.current();
        setCachedResource(cacheKey, fresh);
        setData(fresh);
        setError(null);
        focusPerfMark(`${cacheKey}:fetch_ok`, { mode });
      } catch (e) {
        const msg = (e as Error)?.message || "Request failed";
        setError(msg);
        focusPerfMark(`${cacheKey}:fetch_err`, { mode, msg });
        if (!hasCache) setData(null);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
        setRefreshing(false);
        endPerf();
      }
    },
    [cacheKey]
  );

  const refresh = useCallback(() => {
    void runFetch("manual");
  }, [runFetch]);

  useEffect(() => {
    const freshEnough = getCachedResource<T>(cacheKey, staleMs);
    if (freshEnough) {
      setData(freshEnough);
      setLoading(false);
      return;
    }
    const stale = peekCachedResource<T>(cacheKey);
    if (stale) {
      setData(stale);
      setLoading(false);
      void runFetch("background");
      return;
    }
    void runFetch("initial");
  }, [cacheKey, runFetch, staleMs]);

  useFocusEffect(
    useCallback(() => {
      if (disableFocusRefresh) return;
      const endFocus = focusPerfStart(`${cacheKey}:focus`);
      const age = cacheAgeMs(cacheKey);
      const shouldRefresh = age == null || age > focusRefreshAfterMs;
      if (!shouldRefresh) {
        focusPerfMark(`${cacheKey}:focus_skip_refresh`, { ageMs: age });
        endFocus();
        return undefined;
      }

      const task = InteractionManager.runAfterInteractions(() => {
        focusPerfMark(`${cacheKey}:focus_background_refresh`, { ageMs: age });
        void runFetch("background");
      });

      return () => {
        task.cancel();
        endFocus();
      };
    }, [cacheKey, disableFocusRefresh, focusRefreshAfterMs, runFetch])
  );

  return { data, error, loading, refreshing, refresh };
}
