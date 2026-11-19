// The one Zoho Books client every push function uses: gateway calls with the
// linked connector, Zoho's own refusal text, the default organisation, and
// find-or-create of a contact by exact name. zoho-push-expense and
// zoho-push-invoice both go through this - do not add a second copy.
import { json } from "./comms-auth.ts";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/zoho_books";

export type ZohoResult = { ok: true; data: any } | { ok: false; status: number; message: string };
export type ZohoRefusal = { ok: false; status: number; message: string };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

// Zoho answers { code, message }; code 0 is success. Returns Zoho's own message
// for anything else, or null when the call succeeded.
export function zohoFailure(status: number, payload: unknown, rawText: string): string | null {
  const p = (payload ?? {}) as { code?: number; message?: string };
  const ok = status >= 200 && status < 300 && (p.code === undefined || p.code === 0);
  if (ok) return null;
  if (typeof p.message === "string" && p.message.trim()) return p.message;
  return rawText?.trim() || `Zoho Books returned HTTP ${status}`;
}

// Exact (trimmed, case-insensitive) name match of a contact of the given type.
export function findContactId(
  contacts: { contact_id: string; contact_name: string; contact_type?: string }[] | null | undefined,
  name: string,
  type: "vendor" | "customer",
): string | null {
  const wanted = norm(name);
  if (!wanted) return null;
  const hit = (contacts ?? []).find((c) => norm(c.contact_name) === wanted && (!c.contact_type || c.contact_type === type));
  return hit?.contact_id ?? null;
}

export function zohoConfigured(): boolean {
  return Boolean(Deno.env.get("LOVABLE_API_KEY") && Deno.env.get("ZOHO_BOOKS_API_KEY"));
}

export async function zoho(path: string, init: { method?: string; body?: unknown } = {}): Promise<ZohoResult> {
  const res = await fetch(`${GATEWAY_URL}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "X-Connection-Api-Key": Deno.env.get("ZOHO_BOOKS_API_KEY")!,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let payload: unknown = null;
  try { payload = JSON.parse(text); } catch { /* non-JSON error body */ }
  const failure = zohoFailure(res.status, payload, text);
  if (failure) {
    console.error(`Zoho ${init.method ?? "GET"} ${path.split("?")[0]} failed [${res.status}]: ${text}`);
    return { ok: false, status: res.status, message: failure };
  }
  return { ok: true, data: payload };
}

// Zoho's refusal, passed to the browser with Zoho's own message.
export const zohoRefused = (r: { status: number; message: string }) =>
  json({ error: r.message, source: "zoho" }, r.status >= 400 && r.status < 600 ? r.status : 502);

// "organization_id=..." for the default (or only) Zoho Books organisation.
export async function zohoOrgQuery(): Promise<{ ok: true; q: string } | ZohoRefusal> {
  const orgs = await zoho("/organizations");
  if (!orgs.ok) return orgs;
  const list = (orgs.data?.organizations ?? []) as { organization_id: string; is_default_org?: boolean }[];
  const org = list.find((o) => o.is_default_org) ?? list[0];
  if (!org) return { ok: false, status: 502, message: "No Zoho Books organisation found" };
  return { ok: true, q: `organization_id=${encodeURIComponent(org.organization_id)}` };
}

// Contact found by exact name, otherwise created with that name.
export async function findOrCreateZohoContact(
  q: string,
  name: string,
  type: "vendor" | "customer",
): Promise<{ ok: true; id: string | null } | ZohoRefusal> {
  const found = await zoho(`/contacts?${q}&contact_type=${type}&contact_name=${encodeURIComponent(name)}`);
  if (!found.ok) return found;
  const existing = findContactId(found.data?.contacts, name, type);
  if (existing) return { ok: true, id: existing };
  const created = await zoho(`/contacts?${q}`, { method: "POST", body: { contact_name: name, contact_type: type } });
  if (!created.ok) return created;
  return { ok: true, id: (created.data?.contact?.contact_id as string | undefined) ?? null };
}
