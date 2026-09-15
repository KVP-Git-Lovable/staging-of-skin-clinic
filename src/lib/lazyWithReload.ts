import { lazy, type ComponentType } from "react";

const RELOAD_KEY = "chunk-reload-at";

/**
 * Route-level lazy() that survives stale chunk hashes after a new deploy.
 * If the dynamic import fails (old index.html pointing at removed assets),
 * retry once, then hard-reload the page (at most once per minute) so the
 * browser fetches the fresh asset manifest instead of showing a blank screen.
 */
export function lazyWithReload<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
) {
  return lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      // A stale index.html is pointing at asset filenames that no longer
      // exist. Drop every cached copy (service worker + Cache Storage) so the
      // reload fetches the current asset manifest.
      try {
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
        }
      } catch {
        /* cache clearing is best-effort */
      }

      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last > 30_000) {
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
        window.location.reload();
        // Never resolves; the reload takes over.
        return await new Promise<{ default: T }>(() => {});
      }
      throw err;
    }
  });
}

