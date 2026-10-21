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
const cacheTtl = 20_000;
let resourceVersion = 0;

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
    if (version === resourceVersion) resourceCache.set(key, { data, expiresAt: Date.now() + cacheTtl });
    return data;
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
  const refresh = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    window.addEventListener("incoc:data-changed", refresh);
    return () => window.removeEventListener("incoc:data-changed", refresh);
  }, [refresh]);

  useEffect(() => {
    let active = true;
    void loadCached(key, load).then((data) => {
      if (active) setState({ key, data, loading: false, error: "" });
    }).catch((loadError: unknown) => {
      if (active) setState({
        key,
        data: null,
        loading: false,
        error: loadError instanceof Error ? loadError.message : "Unable to load this page.",
      });
    });
    return () => { active = false; };
  }, [key, load, revision]);

  return {
    data: state.key === key ? state.data : null,
    loading: state.key !== key || state.loading,
    error: state.key === key ? state.error : "",
    refresh,
  };
}
