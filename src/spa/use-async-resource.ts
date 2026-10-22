import { useCallback, useEffect, useState } from "react";

type ResourceState<T> = {
  key: string;
  data: T | null;
  loading: boolean;
  error: string;
};

type CachedResource = { data: unknown; expiresAt: number };
const resourceCache = new Map<string, CachedResource>();
const pendingResources = new Map<string, Promise<unknown>>();
const deletedScheduleIds = new Set<string>();
const cacheTtl = 20_000;
let resourceVersion = 0;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function filterDeletedSchedules(key: string, data: unknown) {
  if (key === "admin:schedules" && Array.isArray(data)) {
    return data.filter((item) => !(item && typeof item === "object"
      && "id" in item && typeof item.id === "string" && deletedScheduleIds.has(item.id)));
  }
  if (!key.startsWith("schedules:") && !key.startsWith("slides:list:")) return data;
  if (!isRecord(data) || !Array.isArray(data.schedules)) return data;

  const schedules = data.schedules.filter((item) => !(item && typeof item === "object"
    && "id" in item && typeof item.id === "string" && deletedScheduleIds.has(item.id)));
  if (schedules.length === data.schedules.length) return data;
  const removedCount = data.schedules.length - schedules.length;
  return {
    ...data,
    schedules,
    ...(typeof data.count === "number" ? { count: Math.max(0, data.count - removedCount) } : {}),
  };
}

export function applyScheduleDeletion(scheduleId: string) {
  if (deletedScheduleIds.has(scheduleId)) return false;
  deletedScheduleIds.add(scheduleId);
  resourceVersion += 1;
  pendingResources.clear();
  for (const [key, cached] of resourceCache) {
    if (key.startsWith(`schedule:${scheduleId}`) || key.startsWith(`admin:schedule:${scheduleId}`)) {
      resourceCache.delete(key);
      continue;
    }
    resourceCache.set(key, { ...cached, data: filterDeletedSchedules(key, cached.data) });
  }
  window.dispatchEvent(new CustomEvent("incoc:schedule-deleted", { detail: scheduleId }));
  return true;
}

export function clearResourceCache() {
  resourceVersion += 1;
  resourceCache.clear();
  pendingResources.clear();
}

function cachedData<T>(key: string) {
  const cached = resourceCache.get(key);
  if (!cached || cached.expiresAt <= Date.now()) {
    resourceCache.delete(key);
    return undefined;
  }
  return cached.data as T;
}

async function loadCached<T>(key: string, load: () => Promise<T>) {
  const cached = cachedData<T>(key);
  if (cached !== undefined) return cached;
  const pending = pendingResources.get(key);
  if (pending) return pending as Promise<T>;
  const version = resourceVersion;
  const request = load().then((data) => {
    const currentData = filterDeletedSchedules(key, data);
    if (version === resourceVersion) resourceCache.set(key, { data: currentData, expiresAt: Date.now() + cacheTtl });
    return currentData as T;
  }).finally(() => {
    if (pendingResources.get(key) === request) pendingResources.delete(key);
  });
  pendingResources.set(key, request);
  return request;
}

export function useAsyncResource<T>(key: string, load: () => Promise<T>) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<ResourceState<T>>(() => {
    const data = cachedData<T>(key);
    return data === undefined
      ? { key, data: null, loading: true, error: "" }
      : { key, data, loading: false, error: "" };
  });
  const refresh = useCallback(() => {
    setState((current) => current.key === key ? { ...current, loading: true, error: "" } : current);
    setRevision((value) => value + 1);
  }, [key]);

  useEffect(() => {
    window.addEventListener("incoc:data-changed", refresh);
    return () => window.removeEventListener("incoc:data-changed", refresh);
  }, [refresh]);

  useEffect(() => {
    function onScheduleDeleted(event: Event) {
      const scheduleId = (event as CustomEvent<unknown>).detail;
      if (typeof scheduleId !== "string") return;
      setState((current) => current.key === key
        ? { ...current, data: filterDeletedSchedules(key, current.data) as T | null }
        : current);
    }
    window.addEventListener("incoc:schedule-deleted", onScheduleDeleted);
    return () => window.removeEventListener("incoc:schedule-deleted", onScheduleDeleted);
  }, [key]);

  useEffect(() => {
    let active = true;
    void loadCached(key, load).then((data) => {
      if (active) setState({ key, data, loading: false, error: "" });
    }).catch((loadError: unknown) => {
      if (active) setState((current) => ({
        key,
        data: current.key === key ? current.data : null,
        loading: false,
        error: loadError instanceof Error ? loadError.message : "Unable to load this page.",
      }));
    });
    return () => { active = false; };
  }, [key, load, revision]);

  return {
    data: state.key === key ? state.data : cachedData<T>(key) ?? null,
    loading: state.key === key ? state.loading : cachedData<T>(key) === undefined,
    error: state.key === key ? state.error : "",
    refresh,
  };
}
