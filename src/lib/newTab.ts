/**
 * Opening a tab for something that has to be fetched first.
 *
 * A browser only honours window.open while it is still handling the click
 * that caused it. Code that awaits an edge function, a PDF build or a page
 * of rows and *then* opens a tab has already spent that permission, so the
 * open is treated as an unsolicited pop-up and blocked - which is what staff
 * saw on every invoice PDF, prescription preview and appointment printout.
 *
 * The fix is to claim the tab in the click itself, while the permission is
 * still good, and point it at the document once it is ready. The patient
 * portal has always done this inline (Portal.tsx, viewInvoicePdf); this is
 * the same move, shared.
 *
 * Call reserveTab() as the FIRST statement of the handler - before any
 * await, and not inside a promise callback, where the gesture is already
 * gone.
 */

export interface PendingTab {
  /**
   * The browser refused even the synchronous open, so pop-ups are blocked
   * for the whole site and nothing here can open one. Offer the user a link
   * to click instead: that click is a fresh gesture and is always allowed.
   */
  readonly blocked: boolean;
  /**
   * Send the reserved tab to a finished document.
   *
   * CAUTION, and it has no callers at the time of writing. The Google review
   * button used this and the tab sat on the placeholder for ever: navigate
   * disowns the window (opener = null) before assigning location, and a
   * disowned popup is no longer the opener's to steer. The assignment is
   * wrapped in a catch, so the failure is silent. Its tests pass because they
   * run against a stub window, not a browser.
   *
   * Reach for this ONLY when a tab must be claimed before an await. If the
   * URL is already known - as the review button's was - use
   * window.open(url, "_blank", "noopener,noreferrer") instead, which is what
   * the rest of the app does and what that button does now.
   */
  navigate(url: string): void;
  /** Fill the reserved tab with a document we built ourselves. */
  write(html: string): void;
  /** Bring it forward and print it, once the content has had a moment to lay out. */
  print(delayMs?: number): void;
  /**
   * Say why nothing is coming. Better than cancel() when the user is
   * looking at the tab: a tab that closes itself reads as "nothing
   * happened", and one left on the placeholder reads as "still working"
   * forever.
   */
  fail(message: string): void;
  /** The work failed - close the tab rather than leaving it sitting on the placeholder. */
  cancel(): void;
}

const failureDoc = (message: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>Could not open</title>
<style>
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color:#334155; background:#f8fafc; text-align:center; padding:24px; }
  .msg { max-width:32rem; font-size:15px; line-height:1.6; }
  .hint { margin-top:10px; font-size:13px; color:#64748b; }
</style></head>
<body><div class="msg">${message}<div class="hint">You can close this tab and try again.</div></div></body></html>`;

const placeholderDoc = (message: string) => `<!doctype html>
<html><head><meta charset="utf-8"><title>${message}</title>
<style>
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
         font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
         color:#334155; background:#f8fafc; }
  .msg { font-size:15px; }
  .dot { display:inline-block; width:8px; height:8px; margin-right:10px; border-radius:50%;
         background:#0d9488; animation: pulse 1s ease-in-out infinite; }
  @keyframes pulse { 0%,100% { opacity:.25 } 50% { opacity:1 } }
</style></head>
<body><div class="msg"><span class="dot"></span>${message}</div></body></html>`;

/**
 * Claims a tab now and hands back a handle to fill in later.
 *
 * The placeholder matters: without it the user watches a blank tab for as
 * long as the PDF takes and assumes it has hung.
 */
export function reserveTab(message = "Preparing your document…"): PendingTab {
  let win: Window | null = null;
  try {
    win = window.open("", "_blank");
  } catch {
    win = null;
  }

  const fill = (html: string) => {
    if (!win) return;
    try {
      // Writing to a closed document implicitly reopens it, so the
      // placeholder is replaced rather than appended to.
      win.document.write(html);
      win.document.close();
    } catch {
      // about:blank can refuse document.write under some policies. The tab
      // is still ours to navigate, so this is not fatal.
    }
  };

  fill(placeholderDoc(message));

  return {
    get blocked() {
      return !win;
    },
    navigate(url: string) {
      if (!win) return;
      try {
        // window.open(url, "_blank", "noopener") returns null, so a reserved
        // tab cannot ask for noopener up front. Severing it by hand gives
        // the same protection before we leave for storage.
        (win as unknown as { opener: unknown }).opener = null;
      } catch {
        /* cross-origin already, nothing to sever */
      }
      try {
        if (win.location) win.location.href = url;
        else (win as unknown as { location: string }).location = url;
      } catch {
        /* the user closed the tab while we were working */
      }
    },
    write: fill,
    fail(message: string) {
      fill(failureDoc(message));
    },
    print(delayMs = 400) {
      if (!win) return;
      try {
        win.focus();
      } catch {
        /* not focusable, print still works */
      }
      setTimeout(() => {
        try {
          win?.print();
        } catch {
          /* the user closed the tab before it rendered */
        }
      }, delayMs);
    },
    cancel() {
      try {
        win?.close();
      } catch {
        /* already gone */
      }
      win = null;
    },
  };
}
