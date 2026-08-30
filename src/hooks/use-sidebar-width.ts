import { useCallback, useEffect, useState } from "react";

/**
 * Operator-controlled width for the section navigation.
 *
 * The chosen width is remembered in the browser only. It is a viewing
 * preference, not stored evidence, so it never touches the database and a
 * fresh browser simply starts at the default rather than showing an absence.
 */

export const SIDEBAR_WIDTH_DEFAULT = 208;
export const SIDEBAR_WIDTH_MIN = 168;
export const SIDEBAR_WIDTH_MAX = 420;
const STORAGE_KEY = "aoos.sidebar-width";

export function clampSidebarWidth(width: number): number {
  if (!Number.isFinite(width)) return SIDEBAR_WIDTH_DEFAULT;
  return Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, Math.round(width)));
}

export function useSidebarWidth() {
  // Server and first client render must agree, so the stored value is read
  // after mount rather than in the initialiser.
  const [width, setWidth] = useState(SIDEBAR_WIDTH_DEFAULT);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === null) return;
    setWidth(clampSidebarWidth(Number(stored)));
  }, []);

  const commit = useCallback((next: number) => {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // A blocked storage quota must not break navigation.
    }
  }, []);

  const reset = useCallback(() => {
    commit(SIDEBAR_WIDTH_DEFAULT);
  }, [commit]);

  return { width, setWidth: commit, reset };
}
