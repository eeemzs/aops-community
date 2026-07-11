import { useSyncExternalStore } from "react";

export type CockpitViewport = "mobile" | "narrow" | "desktop";

export interface CockpitViewportSnapshot {
  viewport: CockpitViewport;
  compactDensity: boolean;
}

export const MOBILE_VIEWPORT_QUERY = "(max-width: 767px)";
export const NARROW_VIEWPORT_QUERY = "(max-width: 1080px)";
export const COMPACT_DENSITY_QUERY = "(max-width: 480px)";

const SERVER_SNAPSHOT: CockpitViewportSnapshot = {
  viewport: "desktop",
  compactDensity: false
};

const listeners = new Set<() => void>();
let mediaQueries: MediaQueryList[] | null = null;
let currentSnapshot = readViewportSnapshot();

function readViewportSnapshot(): CockpitViewportSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;

  const mobile = window.matchMedia(MOBILE_VIEWPORT_QUERY).matches;
  const narrow = window.matchMedia(NARROW_VIEWPORT_QUERY).matches;
  return {
    viewport: mobile ? "mobile" : narrow ? "narrow" : "desktop",
    compactDensity: window.matchMedia(COMPACT_DENSITY_QUERY).matches
  };
}

function refreshViewportSnapshot(): void {
  const next = readViewportSnapshot();
  if (
    next.viewport === currentSnapshot.viewport &&
    next.compactDensity === currentSnapshot.compactDensity
  ) {
    return;
  }

  currentSnapshot = next;
  listeners.forEach((listener) => listener());
}

function ensureMediaQueryObserver(): void {
  if (typeof window === "undefined" || mediaQueries) return;
  mediaQueries = [
    window.matchMedia(MOBILE_VIEWPORT_QUERY),
    window.matchMedia(NARROW_VIEWPORT_QUERY),
    window.matchMedia(COMPACT_DENSITY_QUERY)
  ];
  mediaQueries.forEach((query) => query.addEventListener("change", refreshViewportSnapshot));
  refreshViewportSnapshot();
}

function releaseMediaQueryObserver(): void {
  if (!mediaQueries || listeners.size > 0) return;
  mediaQueries.forEach((query) => query.removeEventListener("change", refreshViewportSnapshot));
  mediaQueries = null;
}

function subscribeViewport(listener: () => void): () => void {
  listeners.add(listener);
  ensureMediaQueryObserver();
  return () => {
    listeners.delete(listener);
    releaseMediaQueryObserver();
  };
}

function getViewportSnapshot(): CockpitViewportSnapshot {
  return currentSnapshot;
}

export function useCockpitViewport(): CockpitViewportSnapshot {
  return useSyncExternalStore(subscribeViewport, getViewportSnapshot, () => SERVER_SNAPSHOT);
}
