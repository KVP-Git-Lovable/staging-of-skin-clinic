/**
 * Is the app running inside somebody else's frame?
 *
 * The Lovable editor shows the app in an iframe. That iframe is sandboxed, and
 * a popup opened from a sandboxed frame INHERITS the sandbox - the new tab gets
 * an opaque origin rather than a real one. WhatsApp refuses to serve a document
 * in that state, and Chrome reports it as
 * "web.whatsapp.com is blocked / ERR_BLOCKED_BY_RESPONSE".
 *
 * The same failure was blamed on wa.me once before, because wa.me redirects
 * through api.whatsapp.com and that was the host named in the error. Going
 * straight to web.whatsapp.com removed the redirect; it could not remove the
 * frame, so the error came back wearing a different hostname. Hence this check,
 * which names the actual cause.
 *
 * Nothing in JavaScript gets out of it: the sandbox travels with the popup, and
 * a handoff page on our own origin would inherit the same flags. So the only
 * honest thing to do is say so and offer the message to copy.
 */

/**
 * True when this window is not the top-level one.
 *
 * `win.self !== win.top` is a reference comparison and is allowed across
 * origins, but a hostile or unusual embedder can still make reading `top`
 * throw. A throw means we are certainly inside something, so it counts as
 * embedded rather than being swallowed.
 *
 * Takes its window so a test can hand it a fake; jsdom's real one cannot be
 * reframed.
 */
export function isEmbedded(win: { self: unknown; top: unknown } = window): boolean {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

/**
 * What staff read instead of a blocked page.
 *
 * It names the cause and the way out, because "blocked" on its own sends
 * somebody looking for a setting to change in WhatsApp, which is the one place
 * the problem is not.
 */
export const EMBEDDED_WHATSAPP_NOTICE = "WhatsApp cannot open from the preview panel";

export const EMBEDDED_WHATSAPP_DETAIL =
  "You are viewing the app inside the Lovable editor, and WhatsApp refuses to open from there. " +
  "Open the app in its own browser tab and the button will work — or copy the message and paste it into WhatsApp.";
