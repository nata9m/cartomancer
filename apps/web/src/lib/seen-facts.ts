'use client';

import type { Filters } from './filters';

/**
 * Guest fact rotation: keeps a list of seen fact IDs in localStorage, keyed
 * by filter combination. When all facts for a filter combo have been seen
 * (the API returns fewer questions than requested), the list auto-resets on
 * the next play.
 */
const STORAGE_KEY = 'cartomancer.seenFacts';

interface SeenStore {
  [filterKey: string]: number[];
}

function filterKey(filters: Filters): string {
  const r = filters.region || 'all';
  const d = filters.difficulty || 'all';
  return `${r}:${d}`;
}

function load(): SeenStore {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SeenStore) : {};
  } catch {
    return {};
  }
}

function save(store: SeenStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Full localStorage is not worth breaking the quiz over.
  }
}

export function getSeenFactIds(filters: Filters): number[] {
  const store = load();
  return store[filterKey(filters)] ?? [];
}

export function addSeenFactIds(filters: Filters, ids: number[]): void {
  if (ids.length === 0) return;
  const store = load();
  const key = filterKey(filters);
  const existing = store[key] ?? [];
  const combined = [...new Set([...existing, ...ids])];
  store[key] = combined;
  save(store);
}

/** Resets the seen list for a filter combo (when the pool is exhausted). */
export function resetSeenFacts(filters: Filters): void {
  const store = load();
  delete store[filterKey(filters)];
  save(store);
}
