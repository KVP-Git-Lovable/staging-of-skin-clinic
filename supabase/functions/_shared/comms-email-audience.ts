import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { resolvePatientSet } from "./comms-audience.ts";

export interface EmailRecipient {
  email: string;
  first_name: string;
  last_name: string;
  patient_id: string;
}

export interface EmailAudience {
  recipients: EmailRecipient[];
  total: number;
  matched: number;
  withoutEmail: number;
  suppressed: number;
  perSegment: Record<string, number>;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadSuppressed(db: SupabaseClient): Promise<Set<string>> {
  const out = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("comms_email_suppressions").select("email").range(from, from + 999);
    if (error) throw new Error(`suppressions load failed: ${error.message}`);
    for (const r of data ?? []) out.add(String(r.email).toLowerCase());
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** Patients from the saved-view audience who have a valid, unsuppressed email (one row per address). */
export async function resolveEmailAudience(db: SupabaseClient, audienceConfig: unknown): Promise<EmailAudience> {
  const { patients, perSegment } = await resolvePatientSet(db, audienceConfig);
  const suppressedSet = await loadSuppressed(db);
  const seen = new Set<string>();
  const recipients: EmailRecipient[] = [];
  let withoutEmail = 0;
  let suppressed = 0;
  for (const p of patients) {
    const email = String(p.email ?? "").trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      withoutEmail++;
      continue;
    }
    if (suppressedSet.has(email)) {
      suppressed++;
      continue;
    }
    if (seen.has(email)) continue;
    seen.add(email);
    recipients.push({ email, first_name: p.first_name ?? "", last_name: p.last_name ?? "", patient_id: p.id });
  }
  return { recipients, total: recipients.length, matched: patients.length, withoutEmail, suppressed, perSegment };
}
