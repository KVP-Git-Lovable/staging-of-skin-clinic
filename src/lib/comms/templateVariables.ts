export type VariableGroup = { label: string; variables: { name: string; label: string; sample: string }[] };

export const VARIABLE_GROUPS: VariableGroup[] = [
  {
    label: "Patient",
    variables: [
      { name: "patient_name", label: "Full name", sample: "Asha Rao" },
      { name: "patient_first_name", label: "First name", sample: "Asha" },
      { name: "patient_last_name", label: "Last name", sample: "Rao" },
      { name: "patient_phone", label: "Phone number", sample: "+919876543210" },
      { name: "last_visit_date", label: "Last visit date", sample: "12 Sep 2026" },
    ],
  },
  {
    label: "Appointment",
    variables: [
      { name: "appointment_date", label: "Date", sample: "Monday, 20 Oct 2026" },
      { name: "appointment_time", label: "Time", sample: "11:30 AM" },
      { name: "appointment_service", label: "Service", sample: "Laser Hair Reduction" },
      { name: "doctor_name", label: "Doctor name", sample: "Dr. Vindhya Pai" },
    ],
  },
  {
    label: "Billing",
    variables: [
      { name: "invoice_number", label: "Invoice number", sample: "INV-1042" },
      { name: "invoice_total", label: "Invoice total", sample: "₹4,500" },
    ],
  },
  {
    label: "Clinic",
    variables: [{ name: "clinic_name", label: "Clinic name", sample: "The Skin Clinic" }],
  },
];

const KNOWN_SAMPLES = new Map(VARIABLE_GROUPS.flatMap((g) => g.variables).map((v) => [v.name, v.sample]));

const FRIENDLY = /\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}/g;

export function sampleFor(name: string): string {
  return KNOWN_SAMPLES.get(name) ?? "";
}

export function extractFriendlyVariables(body: string): string[] {
  return Array.from(new Set(Array.from(body.matchAll(FRIENDLY)).map((m) => m[1])));
}

// {{patient_name}} -> {{1}}; mapping is { "1": "patient_name" } in order of first appearance.
export function toTwilioBody(body: string): { twilioBody: string; mapping: Record<string, string> } {
  const names = extractFriendlyVariables(body);
  const mapping: Record<string, string> = {};
  names.forEach((n, i) => (mapping[String(i + 1)] = n));
  const twilioBody = body.replace(FRIENDLY, (_m, n: string) => `{{${names.indexOf(n) + 1}}}`);
  return { twilioBody, mapping };
}

export function toFriendlyBody(twilioBody: string, mapping: Record<string, string> | null): string {
  if (!mapping) return twilioBody;
  return twilioBody.replace(/\{\{(\d+)\}\}/g, (m, n: string) => (mapping[n] ? `{{${mapping[n]}}}` : m));
}

export function validateFriendlyBody(body: string): string[] {
  const warnings: string[] = [];
  if (/\{\{\s*\}\}/.test(body)) warnings.push("Empty variable {{}} found");
  if (/\{\{\s*\d+\s*\}\}/.test(body)) warnings.push("Use named variables from Insert Variable instead of {{1}}");
  const stripped = body.replace(FRIENDLY, "");
  if (/\{\{|\}\}/.test(stripped)) warnings.push("Malformed variable — names may use letters, digits and underscores only");
  return warnings;
}
