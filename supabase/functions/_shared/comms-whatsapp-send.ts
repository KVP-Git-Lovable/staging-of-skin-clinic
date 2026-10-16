// Generic WhatsApp Template sender for the Journey engine. Every other WhatsApp function in this
// app (send-appointment-whatsapp, etc) hardcodes one specific template; a journey's "message" step
// can point at any approved comms_whatsapp_templates row, so it needs a template-agnostic sender.
import { twilioCreds } from "./comms-auth.ts";

export interface SendTemplateParams {
  phoneE164: string;
  twilioContentSid: string;
  contentVariables: Record<string, string>;
  /** Twilio calls this URL with delivery/read/failed status updates for the sent message. */
  statusCallbackUrl?: string;
}

export interface SendTemplateResult {
  ok: boolean;
  messageSid?: string;
  error?: string;
}

export async function sendWhatsAppTemplate(params: SendTemplateParams): Promise<SendTemplateResult> {
  const creds = twilioCreds();
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
  if (!creds || !accountSid || !fromNumber) return { ok: false, error: "Twilio not configured" };

  const fromFormatted = fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`;
  const toFormatted = params.phoneE164.startsWith("whatsapp:") ? params.phoneE164 : `whatsapp:${params.phoneE164}`;

  const body = new URLSearchParams({
    To: toFormatted,
    From: fromFormatted,
    ContentSid: params.twilioContentSid,
    ContentVariables: JSON.stringify(params.contentVariables),
  });
  if (params.statusCallbackUrl) body.set("StatusCallback", params.statusCallbackUrl);

  const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: creds.auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("comms-whatsapp-send: Twilio error", { contentSid: params.twilioContentSid, result });
    return { ok: false, error: result?.message || `Twilio error (${res.status})` };
  }
  return { ok: true, messageSid: result.sid };
}

// deno-lint-ignore no-explicit-any
type PatientRow = Record<string, any>;

/**
 * Resolves a journey message node's `variables` map ({{n}} index -> friendly token name, chosen in
 * NodePropertyPanel from VARIABLE_GROUPS) into actual Twilio ContentVariables for one patient.
 * Appointment/Billing tokens (appointment_date, invoice_total, ...) have no meaning for a general
 * audience broadcast - a journey enrollment isn't tied to one appointment or invoice - so they
 * resolve to "" rather than guessing at one.
 */
export function resolveTemplateVariables(
  variables: Record<string, string> | undefined,
  patient: PatientRow,
): Record<string, string> {
  const clinicName = Deno.env.get("CLINIC_NAME") || "";
  const out: Record<string, string> = {};
  for (const [idx, token] of Object.entries(variables || {})) {
    switch (token) {
      case "patient_name":
        out[idx] = `${patient.first_name || ""} ${patient.last_name || ""}`.trim();
        break;
      case "patient_first_name":
        out[idx] = patient.first_name || "";
        break;
      case "patient_last_name":
        out[idx] = patient.last_name || "";
        break;
      case "patient_phone":
        out[idx] = patient.phone || "";
        break;
      case "last_visit_date":
        out[idx] = patient.last_visit_date || "";
        break;
      case "clinic_name":
        out[idx] = clinicName;
        break;
      default:
        out[idx] = "";
    }
  }
  return out;
}
