// Signed OAuth state + return-origin allow-list for the Meta connect popup.
// The state is `base64url(json).hmac` so the callback can trust the origin it carries
// (storehaven's state was unsigned). The HMAC key is META_APP_SECRET.

const PROJECT_REF = "2faada2a-2978-48c3-bbc5-6bf3066e3eec";
export const DEFAULT_ORIGIN = "https://clinic.quickapp.ai";

export function allowedOrigins(): Set<string> {
  const set = new Set<string>([
    DEFAULT_ORIGIN,
    `https://id-preview--${PROJECT_REF}.lovable.app`,
    `https://${PROJECT_REF}.lovableproject.com`,
    "http://localhost:8080",
  ]);
  for (const o of (Deno.env.get("META_ALLOWED_ORIGINS") ?? "").split(",")) {
    const t = o.trim().replace(/\/+$/, "");
    if (t) set.add(t);
  }
  return set;
}

export function isAllowedOrigin(origin: unknown): origin is string {
  return typeof origin === "string" && allowedOrigins().has(origin);
}

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s: string) => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b.padEnd(Math.ceil(b.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
};

async function hmacKey(): Promise<CryptoKey> {
  const secret = Deno.env.get("META_APP_SECRET");
  if (!secret) throw new Error("META_APP_SECRET is not configured");
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export interface OAuthState { origin: string; staffId: string; n: string; exp: number }

export async function signState(payload: { origin: string; staffId: string }): Promise<string> {
  const body: OAuthState = { ...payload, n: crypto.randomUUID(), exp: Date.now() + 15 * 60 * 1000 };
  const data = b64url(new TextEncoder().encode(JSON.stringify(body)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(), new TextEncoder().encode(data)));
  return `${data}.${b64url(sig)}`;
}

/** Returns the decoded state when the signature and expiry are valid, else null. */
export async function verifyState(state: string | null): Promise<OAuthState | null> {
  try {
    if (!state) return null;
    const [data, sig] = state.split(".");
    if (!data || !sig) return null;
    const ok = await crypto.subtle.verify("HMAC", await hmacKey(), fromB64url(sig), new TextEncoder().encode(data));
    if (!ok) return null;
    const body = JSON.parse(new TextDecoder().decode(fromB64url(data))) as OAuthState;
    if (!body.exp || body.exp < Date.now() || !isAllowedOrigin(body.origin)) return null;
    return body;
  } catch {
    return null;
  }
}

/** Origin to send the user back to. Only a verified state can choose a non-default origin. */
export function returnOrigin(state: OAuthState | null): string {
  return state ? state.origin : DEFAULT_ORIGIN;
}
