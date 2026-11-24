import { toast } from "sonner";
import { EMBEDDED_WHATSAPP_DETAIL, EMBEDDED_WHATSAPP_NOTICE, isEmbedded } from "@/lib/embeddedPreview";
import { whatsappAppUrl } from "@/lib/googleReview";

/**
 * The one place the app opens WhatsApp for a staff member.
 *
 * Both the Google review request and the two post-treatment follow-ups come
 * through here. They had a copy each, which is how the same hard-won rules
 * came to be written out twice and would eventually have drifted.
 *
 * ── What changed, and why ──
 *
 * This used to be `window.open(url, "_blank")` on a web.whatsapp.com address.
 * Two complaints, one cause: "_blank" means a NEW tab every single time, so
 * following up on three patients left three WhatsApp tabs; and a web address
 * is something the browser keeps, so the WhatsApp Desktop the clinic has
 * installed on the front desk was never reached.
 *
 * Handing the message to the desktop app fixes both at once, because a
 * protocol launch creates no tab at all.
 *
 * ── The rules, none of them negotiable ──
 *
 *  1. The web URL must be web.whatsapp.com, never wa.me. wa.me redirects
 *     through api.whatsapp.com, which refuses to be framed and produced
 *     "api.whatsapp.com is blocked" for the front desk. That decision lives in
 *     whatsappShareUrl; this function only ever opens what it is handed, and
 *     derives the whatsapp:// address from the same query string so the two
 *     cannot address different people.
 *  2. A protocol launch goes through an anchor that is clicked and removed.
 *     NOT location.href, which navigates the clinic's own tab away on a
 *     machine where the protocol is unregistered, and not a hidden iframe,
 *     which modern Chrome blocks for protocol launches.
 *  3. window.open with NO "noopener" in the features string, and a NAMED
 *     target. The HTML spec makes window.open return null whenever noopener
 *     is set, even when the tab opened perfectly, so the blocked-popup branch
 *     would fire on every successful click; the opener is disowned by hand
 *     instead. The name is what makes a second press reuse the first tab.
 *  4. NEVER a confirm(), alert() or prompt() between the click and the open.
 *     The new tab takes focus, and Chrome silently ignores a dialog asked for
 *     by a background tab: it returns false and nothing happens. Anything to
 *     ask is asked BEFORE this is called.
 *
 * ── What the return value means now ──
 *
 * It used to mean "a tab really opened", and callers record contact on it. A
 * protocol launch reports nothing back - there is no success or failure to
 * read - so on that path this returns true and the open is recorded on the
 * attempt. The case that rule was written for, the Lovable preview panel,
 * still short-circuits below and still records nothing. The cost is an
 * occasionally optimistic "opened on" line in an append-only log that is read
 * newest-first, which is worth the clinic's desktop app working.
 */

/** One tab for WhatsApp, reused. Anything but "_blank", which always opens another. */
export const WHATSAPP_WINDOW_NAME = "clinic-whatsapp";

export function openWhatsApp(url: string, message: string): boolean {
  if (isEmbedded()) {
    // Nothing is opened at all. A tab that is certain to show
    // ERR_BLOCKED_BY_RESPONSE wastes a click and - worse - looks like a send.
    offerCopy(EMBEDDED_WHATSAPP_NOTICE, EMBEDDED_WHATSAPP_DETAIL, message);
    return false;
  }

  launchDesktopApp(whatsappAppUrl(url));
  offerWebInstead(url, message);
  return true;
}

/**
 * Hand the address to the operating system.
 *
 * On a machine with WhatsApp Desktop the app takes it and this page does not
 * move. On a machine without it, nothing happens at all - which is exactly
 * why the toast below exists and why it is raised every time rather than only
 * when something has gone wrong, since nothing tells us whether it has.
 */
function launchDesktopApp(appUrl: string): void {
  const link = document.createElement("a");
  link.href = appUrl;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/** Open WhatsApp Web in the one named tab, reusing it on every later press. */
function openWeb(url: string, message: string): void {
  const win = window.open(url, WHATSAPP_WINDOW_NAME);
  if (!win) {
    offerCopy(
      "Your browser blocked the WhatsApp tab",
      "Copy the message, then paste it into the patient's WhatsApp chat.",
      message,
    );
    return;
  }
  win.opener = null;
}

/** The short notice after a desktop hand-off, carrying the way back. */
function offerWebInstead(url: string, message: string): void {
  toast.message("Opening WhatsApp…", {
    description: "Nothing happened? This machine may not have WhatsApp Desktop installed.",
    action: {
      label: "Use WhatsApp Web",
      onClick: () => openWeb(url, message),
    },
    cancel: {
      label: "Copy message",
      onClick: () => copyMessage(message),
    },
    duration: 10000,
  });
}

/** The message, offered for the clipboard, when a tab is not an option. */
function offerCopy(title: string, description: string, message: string): void {
  toast.message(title, {
    description,
    action: {
      label: "Copy message",
      onClick: () => copyMessage(message),
    },
    duration: 20000,
  });
}

function copyMessage(message: string): void {
  navigator.clipboard.writeText(message).then(
    () => toast.success("Message copied"),
    () => toast.error("Could not copy - your browser blocked the clipboard."),
  );
}
