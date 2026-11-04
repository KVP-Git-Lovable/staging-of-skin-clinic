import { UPDATE_CHECK_INTERVAL_MS, shouldApplyOnReturn, updateActionFor } from "@/lib/pwaUpdate";

/** Untouched this long, with nothing open or typed, is a safe moment to update. */
const IDLE_APPLY_MS = 2 * 60 * 1000;

const APP_SERVICE_WORKER_PATH = "/sw.js";

const isPreviewHost = (hostname: string) =>
  hostname.startsWith("id-preview--") ||
  hostname.startsWith("preview--") ||
  hostname === "lovableproject.com" ||
  hostname.endsWith(".lovableproject.com") ||
  hostname === "lovableproject-dev.com" ||
  hostname.endsWith(".lovableproject-dev.com") ||
  hostname === "beta.lovable.dev" ||
  hostname.endsWith(".beta.lovable.dev");

/**
 * Whether anything on the page would be lost by reloading it.
 *
 * Read off the page rather than tracked, because every form in the app would
 * otherwise have to remember to say so, and the one that forgot would be the
 * one that lost somebody's work. Conservative by design: anything it is unsure
 * about counts as busy, and the update simply waits longer.
 */
const dialogIsOpen = () => Boolean(document.querySelector('[role="dialog"]'));

const somethingIsTyped = () => {
  const fields = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea");
  for (const field of fields) {
    if (field.type === "hidden" || field.disabled || field.readOnly) continue;
    if ((field.value ?? "").trim() !== "") return true;
  }
  for (const editable of document.querySelectorAll<HTMLElement>("[contenteditable='true']")) {
    if ((editable.textContent ?? "").trim() !== "") return true;
  }
  return false;
};

const removeAppServiceWorker = async () => {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations
      .filter((registration) => new URL(registration.active?.scriptURL ?? APP_SERVICE_WORKER_PATH, location.origin).pathname === APP_SERVICE_WORKER_PATH)
      .map((registration) => registration.unregister()),
  );
};

export const registerPwa = async () => {
  if (!("serviceWorker" in navigator)) return;

  const shouldDisable =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    isPreviewHost(window.location.hostname) ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (shouldDisable) {
    await removeAppServiceWorker();
    return;
  }

  const { registerSW } = await import("virtual:pwa-register");

  const registeredAt = Date.now();

  // The update is applied when it costs nothing and offered when it might.
  //
  // This used to be registerType "autoUpdate", which reloaded every open tab as
  // soon as a build was published - the page disappearing mid-consultation.
  // Asking first fixed that and created a worse problem: navigations are served
  // from the old worker's precache, so a build nobody clicked through to was
  // never applied, and no amount of reloading helped. Whole days of fixes sat
  // undelivered.
  //
  // So: a build already waiting when we register arrived with the page, before
  // anything was typed, and goes in silently - which is what makes a stale
  // install recover on the next reload. One that turns up later is held, and
  // goes in the next time the app is picked back up with nothing in progress.
  //
  // That last part is what was missing. The clinic asked for the toast and the
  // header button to go, which left a waiting build with nobody to apply it: a
  // desktop recovered on the next reload, and a phone - backgrounded rather
  // than closed - ran the same bundle for days. Three faults reported in a week
  // were really that.
  let updateWaiting = false;
  let hiddenSince: number | null = null;
  const updateSW = registerSW({
    immediate: true,

    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;

      // Without this an always-open tab never asks whether a newer build exists
      // - registration is the only check there used to be - so a browser left
      // open all day stayed on the build it started with.
      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        registration.update().catch(() => {
          // Offline, or the server is briefly unreachable. The next check will do.
        });
      };

      setInterval(checkForUpdate, UPDATE_CHECK_INTERVAL_MS);

      // A phone kept open in the foreground never "returns" to the app, so a
      // waiting build also goes in once the page has been left untouched for
      // a while with no dialog open and nothing typed - nobody is mid-form,
      // and no popup is shown.
      let lastActivity = Date.now();
      const touch = () => { lastActivity = Date.now(); };
      for (const evt of ["pointerdown", "keydown", "touchstart", "scroll", "input"]) {
        window.addEventListener(evt, touch, { passive: true, capture: true });
      }
      setInterval(() => {
        if (!updateWaiting || document.visibilityState !== "visible") return;
        if (Date.now() - lastActivity < IDLE_APPLY_MS) return;
        if (dialogIsOpen() || somethingIsTyped()) return;
        updateWaiting = false;
        void updateSW(true);
      }, 30_000);
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") {
          hiddenSince = Date.now();
          return;
        }
        checkForUpdate();

        // Coming back to a page somebody put down is the same safe moment as
        // arriving at one: nothing typed, nothing half-finished. Without this
        // a waiting build had nothing to apply it - the clinic had the toast
        // and the header button removed - so a phone, which is backgrounded
        // rather than closed, ran the same bundle for days. See pwaUpdate.ts.
        const hiddenFor = hiddenSince === null ? 0 : Date.now() - hiddenSince;
        hiddenSince = null;
        if (!updateWaiting) return;
        if (!shouldApplyOnReturn({
          hiddenForMs: hiddenFor,
          dialogOpen: dialogIsOpen(),
          hasTypedContent: somethingIsTyped(),
        })) return;
        updateWaiting = false;
        setTimeout(() => void updateSW(true), 0);
      });
    },

    onNeedRefresh() {
      // Deferred a tick because this can fire while registerSW is still
      // returning, before updateSW is assigned.
      const reload = () => setTimeout(() => void updateSW(true), 0);

      if (updateActionFor(Date.now() - registeredAt) === "apply") {
        reload();
        return;
      }

      // Held, not dropped. The visibility handler above puts it in the next
      // time the app is picked back up with nothing in progress.
      updateWaiting = true;

      // Nothing is shown and nothing interrupts. A build that arrives while
      // somebody is working waits for one of two safe moments: the app being
      // loaded again, which lands inside the grace window above, or the person
      // coming back to it after putting it down with nothing in progress. The
      // second is what the visibility handler does - without it, a phone that
      // is never closed had neither.
    },
  });
};
