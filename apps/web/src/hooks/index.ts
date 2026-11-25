'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, useSyncExternalStore, useTransition } from 'react';
import { type Route } from 'next';

/** Value that only updates after `delay` ms without change (search boxes). */
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

/** Subscribes to a CSS media query (e.g. "(min-width: 768px)"). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const STORAGE_EVENT = 'cashpilot:local-storage';

/** UI preferences only (sidebar collapsed…) — never business data. Synced via useSyncExternalStore. */
export function useLocalStorage<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const raw = useSyncExternalStore(
    (onChange) => {
      window.addEventListener('storage', onChange);
      window.addEventListener(STORAGE_EVENT, onChange);
      return () => {
        window.removeEventListener('storage', onChange);
        window.removeEventListener(STORAGE_EVENT, onChange);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    () => null, // server snapshot: preferences are unknown during SSR
  );
  const value = parseStored(raw, initial);
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      let current = initial;
      try {
        current = parseStored(window.localStorage.getItem(key), initial);
      } catch {
        /* blocked storage */
      }
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(current) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* storage full or blocked */
      }
      window.dispatchEvent(new Event(STORAGE_EVENT));
    },
    [key, initial],
  );
  return [value, update];
}

function parseStored<T>(raw: string | null, fallback: T): T {
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/**
 * Filters live in the URL (shareable, survive back navigation).
 * `set({ q: 'abc', page: undefined })` replaces the search params; page resets on filter change.
 */
export function useUrlFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const set = useCallback(
    (patch: Record<string, string | undefined | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === null || v === '') next.delete(k);
        else next.set(k, v);
      }
      if (!('page' in patch)) next.delete('page');
      const query = next.toString();
      startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ''}` as Route, { scroll: false }));
    },
    [params, pathname, router],
  );

  const reset = useCallback(
    (keep: string[] = []) => {
      const next = new URLSearchParams();
      for (const k of keep) {
        const v = params.get(k);
        if (v) next.set(k, v);
      }
      const query = next.toString();
      startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ''}` as Route, { scroll: false }));
    },
    [params, pathname, router],
  );

  return { params, set, reset, pending };
}
