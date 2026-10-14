/**
 * Client helpers for the `mailchimp-api` edge function (Email Marketing tab only).
 * The function answers domain failures with HTTP 200 + { error }; real HTTP errors
 * carry { error } in the body too, so both are read here.
 */
import { supabase } from "@/integrations/supabase/client";

export type EmailProvider = "mailchimp";

export interface MailchimpConnection {
  id: string;
  account_id: string | null;
  account_name: string | null;
  login_email: string | null;
  dc: string | null;
  pricing_plan_type: string | null;
  total_subscribers: number | null;
  default_list_id: string | null;
  default_list_name: string | null;
  webhook_id: string | null;
  consent_confirmed_at: string | null;
  last_ping_at: string | null;
  last_error: string | null;
  auth_mode?: "api_key" | "oauth" | string | null;
  status?: "connected" | "revoked" | string | null;
  connected_by?: string | null;
  connected_at?: string | null;
  oauth_login_name?: string | null;
}

/** Answer of the `status` action. */
export interface MailchimpStatus {
  ok: boolean;
  health?: string;
  error?: string;
  connection: MailchimpConnection | null;
  auth_mode?: "api_key" | "oauth" | string | null;
  api_key_available?: boolean;
}

export interface MailchimpDomain {
  domain: string;
  verified?: boolean;
  authenticated?: boolean;
  verification_email?: string;
  verification_sent?: string;
  status?: string;
}

export interface MailchimpList {
  id: string;
  web_id?: number;
  name: string;
  stats?: { member_count?: number };
  date_created?: string;
}

export interface MailchimpChecklistItem { type: "success" | "warning" | "error" | string; id: number; heading: string; details: string }
export interface MailchimpChecklist { is_ready?: boolean; items?: MailchimpChecklistItem[] }

type InvokeError = { message?: string; context?: { json?: () => Promise<unknown> } } | null | undefined;

async function readError(error: InvokeError, data: { error?: unknown } | null | undefined): Promise<string> {
  if (data?.error) return String(data.error);
  try {
    const body = (await error?.context?.json?.()) as { error?: unknown } | undefined;
    if (body?.error) return String(body.error);
  } catch { /* ignore */ }
  return error?.message || "Something went wrong";
}

/** Calls one mailchimp-api action; throws an Error with Mailchimp's wording on failure. */
export async function mailchimpApi<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke("comms-mailchimp-api", { body: { action, payload } });
  if (error || (data && typeof data === "object" && "error" in data && (data as { error?: unknown }).error)) {
    throw new Error(await readError(error, data as { error?: unknown }));
  }
  return data as T;
}

/** Mailchimp only schedules on :00 / :15 / :30 / :45 UTC; mirrors the edge function's rounding. */
export function roundUpToQuarterHour(d: Date): Date {
  const out = new Date(d.getTime());
  out.setUTCSeconds(0, 0);
  const rem = out.getUTCMinutes() % 15;
  if (rem !== 0) out.setUTCMinutes(out.getUTCMinutes() + (15 - rem));
  return out;
}

export function planLabel(p: string | null | undefined): string {
  switch ((p || "").toLowerCase()) {
    case "forever_free": return "Free";
    case "pay_as_you_go": return "Pay as you go";
    case "monthly": return "Monthly (paid)";
    default: return p || "Unknown";
  }
}

/** A connection is usable when the last ping succeeded and a default audience is chosen. */
export function connectionHealthy(c: MailchimpConnection | null | undefined): boolean {
  return !!c && !!c.last_ping_at && !c.last_error && c.status !== "revoked";
}

export function connectionReadyToSend(c: MailchimpConnection | null | undefined): boolean {
  return connectionHealthy(c) && !!c?.default_list_id;
}

/** Splits "name@kvpcorp.com" into its local part and domain for the verified-domain picker. */
export function splitEmail(email: string): { local: string; domain: string } {
  const at = email.lastIndexOf("@");
  if (at < 0) return { local: email, domain: "" };
  return { local: email.slice(0, at), domain: email.slice(at + 1).toLowerCase() };
}
