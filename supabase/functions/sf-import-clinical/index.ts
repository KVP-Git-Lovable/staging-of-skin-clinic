// Salesforce -> Lovable Cloud import of Appointments (Appointment__c),
// Invoices (Billing__c), and Procedures (Diagnosis__c) for every patient
// that has a Salesforce Id (patients.sf_id) and hasn't been processed by
// this sync yet (patients.sf_clinical_synced_at IS NULL). Each call handles
// one bounded batch and marks each patient it successfully processes, so
// the UI's "Sync from Salesforce" button can just keep calling this until
// it reports 0 patients processed - no offset/cursor bookkeeping needed,
// and newly-linked patients are picked up automatically regardless of
// where they fall in the patient list.
//
// Query params:
//   limit - patients per call, default 25 (keep small; each patient does
//           3 Salesforce queries plus inserts)
//   only  - name substring or patient UUID, for spot-checking a single
//           patient regardless of its synced_at marker
//   reset - "true" to delete this run's target patients' previously
//           Salesforce-imported rows (sf_id IS NOT NULL only - never
//           touches rows created directly in the app) and clear their
//           synced_at marker before re-importing. Off by default.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const SALESFORCE_API_KEY = Deno.env.get("SALESFORCE_API_KEY")!;

const GATEWAY = "https://connector-gateway.lovable.dev/salesforce";
const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

interface Target { lovable_id: string; sf_id: string; name: string }

async function sfQuery(soql: string, signal?: AbortSignal): Promise<any[]> {
  const out: any[] = [];
  let url: string | null = `${GATEWAY}/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const response: Response = await fetch(url, {
      signal,
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "X-Connection-Api-Key": SALESFORCE_API_KEY,
      },
    });
    if (!response.ok) throw new Error(`SF query failed [${response.status}]: ${await response.text()}`);
    const payload: { records?: any[]; done?: boolean; nextRecordsUrl?: string } = await response.json();
    out.push(...(payload.records || []));
    if (payload.done || !payload.nextRecordsUrl) break;
    url = `${GATEWAY}${payload.nextRecordsUrl.replace("/services/data/v62.0", "")}`;
  }
  return out;
}

function normalize(s: string | null | undefined): string {
  return (s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

// Salesforce has no service-catalogue field on an appointment: Investigation__c
// and Description__c are free clinical text ("3rx Face HR (LTB for fine hair was
// done) last session 1/6/2026..."). Dropping that straight into a Service column
// is what put clinical notes on the appointments list, so instead we look for a
// real service name inside the text.
//
// Note the direction: bolna-book-appointment matches `%<service name>%` because
// it is handed a short name. Here the input is the long string, so we ask which
// service name appears INSIDE it. Longest match wins, so "Face HR" beats a short
// name that merely occurs as a substring.
async function buildServiceMatcher(): Promise<(text: string | null | undefined) => string | null> {
  const { data } = await admin.from("services").select("name");
  const names = (data || [])
    .map((r: any) => ({ name: String(r.name || ""), key: normalize(r.name) }))
    // 2 is deliberate, not lazy: the clinic has real two-letter services ("HR").
    // The word-boundary check below is what keeps them safe - a single character
    // would still be too eager ("Laser Toning C" ends in a standalone "c").
    .filter((r) => r.key.length >= 2)
    .sort((a, b) => b.key.length - a.key.length);

  return (text) => {
    const hay = normalize(text);
    if (!hay) return null;
    // normalize() has already reduced both sides to [a-z0-9 ], so padding with
    // spaces makes a plain indexOf a word-boundary check - "hr" no longer
    // matches inside "hydra".
    const padded = ` ${hay} `;
    for (const r of names) {
      if (padded.includes(` ${r.key} `)) return r.name;
    }
    return null;
  };
}

// Build doctor -> staff.id map by fuzzy name contains.
async function buildDoctorMap(): Promise<(sfName: string | null) => string | null> {
  const { data } = await admin.from("staff").select("id, first_name, last_name");
  const rows = (data || []).map((s) => {
    const firstTokens = normalize(s.first_name).split(" ").filter((t) => t.length > 2 && t !== "dr");
    return {
      id: s.id as string,
      key: normalize(`${s.first_name} ${s.last_name}`),
      firstToken: firstTokens[0] || null,
    };
  });
  // A first name alone only safely identifies someone if it's unique across
  // staff - never used as a fallback when two staff share a first name.
  const firstNameCounts = new Map<string, number>();
  rows.forEach((r) => {
    if (r.firstToken) firstNameCounts.set(r.firstToken, (firstNameCounts.get(r.firstToken) || 0) + 1);
  });

  return (sfName: string | null) => {
    if (!sfName) return null;
    const key = normalize(sfName);
    for (const r of rows) {
      if (!r.key) continue;
      const tokens = r.key.split(" ").filter((t) => t.length > 2 && t !== "dr");
      if (tokens.length && tokens.every((t) => key.includes(t))) return r.id;
    }
    // Fallback: an unambiguous first-name match - covers a staff member
    // whose surname on file differs from what Salesforce sent (e.g. a
    // maiden/alternate surname), as long as their first name alone
    // uniquely identifies them among all staff.
    for (const r of rows) {
      if (r.firstToken && firstNameCounts.get(r.firstToken) === 1 && key.includes(r.firstToken)) return r.id;
    }
    return null;
  };
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Run `fn` over `items` with at most `concurrency` in flight at once.
// Salesforce queries and DB inserts across different patients are fully
// independent, so this is safe - it just caps how many we hit at once to
// stay within Salesforce API burst limits.
async function mapPool<T>(items: T[], concurrency: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (i < items.length) {
      const item = items[i++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

async function fetchTargets(only: string, limit: number): Promise<Target[]> {
  if (only) {
    const { data, error } = await admin
      .from("patients")
      .select("id, sf_id, first_name, last_name")
      .not("sf_id", "is", null);
    if (error) throw error;
    return (data || [])
      .filter((p) => p.id === only || `${p.first_name} ${p.last_name}`.toLowerCase().includes(only.toLowerCase()))
      .map((p) => ({ lovable_id: p.id, sf_id: p.sf_id as string, name: `${p.first_name} ${p.last_name}`.trim() }));
  }
  const { data, error } = await admin
    .from("patients")
    .select("id, sf_id, first_name, last_name")
    .not("sf_id", "is", null)
    .is("sf_clinical_synced_at", null)
    .order("created_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  return (data || []).map((p) => ({ lovable_id: p.id, sf_id: p.sf_id as string, name: `${p.first_name} ${p.last_name}`.trim() }));
}

// "Recent" mode: instead of walking never-synced patients (all of which are
// long since marked done), ask Salesforce which patients have appointments
// inside a date window and re-run the normal per-patient import for exactly
// those. Everything already imported is skipped by sf_id, so repeated runs
// are safe and only bring in newly-created Salesforce records.
async function fetchRecentTargets(
  fromIso: string,
  toIso: string,
): Promise<{ targets: Target[]; unmatched: number; sfPatients: number; createdPatients: number }> {
  const rows = await sfQuery(
    `SELECT Patient__c FROM Appointment__c WHERE Start_Time__c >= ${fromIso} AND Start_Time__c <= ${toIso} AND Patient__c != null`,
  );
  const sfIds = Array.from(new Set(rows.map((r: any) => String(r.Patient__c))));
  const targets: Target[] = [];
  const found = new Set<string>();
  for (const batch of chunk(sfIds, 200)) {
    const { data, error } = await admin
      .from("patients")
      .select("id, sf_id, first_name, last_name")
      .in("sf_id", batch);
    if (error) throw error;
    (data || []).forEach((p: any) => {
      found.add(p.sf_id);
      targets.push({ lovable_id: p.id, sf_id: p.sf_id, name: `${p.first_name} ${p.last_name}`.trim() });
    });
  }

  // Salesforce patients that don't exist in the app at all yet (brand-new
  // walk-ins registered in Salesforce today). Without this their whole
  // appointment simply never arrives. Link by phone when an app patient
  // already has that number; otherwise create the patient record.
  const missing = sfIds.filter((id) => !found.has(id));
  let createdPatients = 0;
  for (const batch of chunk(missing, 200)) {
    const sfPatients = await sfQuery(
      `SELECT Id, Patient_Name__c, Mobile_Number__c FROM Patient__c WHERE Id IN (${batch.map((id) => `'${id}'`).join(",")})`,
    );
    for (const sp of sfPatients) {
      const fullName = String(sp.Patient_Name__c || "Unknown").trim();
      const phone = String(sp.Mobile_Number__c || "").replace(/\D/g, "").slice(-10);
      let lovableId: string | null = null;

      if (phone.length === 10) {
        const { data: byPhone } = await admin
          .from("patients")
          .select("id, sf_id")
          .ilike("phone", `%${phone}%`)
          .limit(2);
        if (byPhone && byPhone.length === 1 && !byPhone[0].sf_id) {
          await admin.from("patients").update({ sf_id: sp.Id }).eq("id", byPhone[0].id);
          lovableId = byPhone[0].id;
        }
      }

      if (!lovableId) {
        const parts = fullName.split(/\s+/);
        const { data: created, error } = await admin
          .from("patients")
          .insert({
            first_name: parts[0] || "Unknown",
            last_name: parts.slice(1).join(" ") || "",
            phone: phone || null,
            sf_id: sp.Id,
            source: "salesforce",
          })
          .select("id")
          .single();
        if (error || !created) continue;
        lovableId = created.id;
        createdPatients++;
      }

      targets.push({ lovable_id: lovableId, sf_id: sp.Id, name: fullName });
      found.add(sp.Id);
    }
  }

  return { targets, unmatched: sfIds.length - found.size, sfPatients: sfIds.length, createdPatients };
}



async function existingSfIds(table: string, patientId: string): Promise<Set<string>> {
  const { data } = await admin.from(table).select("sf_id").eq("patient_id", patientId).not("sf_id", "is", null);
  return new Set((data || []).map((r: any) => r.sf_id as string));
}

async function syncPatient(
  p: Target,
  doctorFor: (n: string | null) => string | null,
  serviceFor: (text: string | null | undefined) => string | null,
  reset: boolean,
  log: any,
  signal?: AbortSignal,
  refreshExisting = false,
) {
  if (reset) {
    await admin.from("procedures").delete().eq("patient_id", p.lovable_id).not("sf_id", "is", null);
    await admin.from("invoices").delete().eq("patient_id", p.lovable_id).not("sf_id", "is", null);
    await admin.from("appointments").delete().eq("patient_id", p.lovable_id).not("sf_id", "is", null);
  }

  const [existingApptRows, existingInvoices, existingProcs] = await Promise.all([
    admin.from("appointments").select("id, sf_id").eq("patient_id", p.lovable_id).not("sf_id", "is", null)
      .then(({ data }) => data || []),
    existingSfIds("invoices", p.lovable_id),
    existingSfIds("procedures", p.lovable_id),
  ]);
  const existingAppts = new Set(existingApptRows.map((r: any) => r.sf_id as string));

  // Independent per-patient queries - run concurrently instead of one
  // after another (this is the main driver of total sync time at scale).
  const [appts, billings, diagnoses] = await Promise.all([
    sfQuery(
      `SELECT Id, Start_Time__c, End_Time__c, Appointment_Status__c, Appointment_type__c, Visit_Type__c, Doctor_Name__c, Investigation__c, Description__c, CreatedDate FROM Appointment__c WHERE Patient__c = '${p.sf_id}'`,
      signal,
    ),
    sfQuery(
      `SELECT Id, Name, Appointment__c, Billing_Date__c, Discount__c, GST__c, Quantity__c, Total_Amount__c, Total_Price__c, Total_Tax_Applicable__c, Total_Service_Fee__c, Payment_Mode__c, Procedure_Type__c, Procedure_Type_2__c, Procedure_Type_3__c, Doctor_Name__c, CreatedDate FROM Billing__c WHERE Patient__c = '${p.sf_id}'`,
      signal,
    ),
    sfQuery(
      `SELECT Id, Appointment__c, Diagnosis__c, Diagnoses__c, Symptoms__c, Symptoms_all__c, Prescription__c, Advice__c, Dietary_Advice__c, Procedure_Type__c, Treatment__c, Service_Type__c, Type_Of_Appointment__c, Visit_type__c, Special_Instructions__c, Payment_Instruction__c, Required_Lab_Test_s__c, History__c, Review__c, Follow_Up_Date__c, Consultation_Fee__c, CreatedDate FROM Diagnosis__c WHERE Patient__c = '${p.sf_id}'`,
      signal,
    ),
  ]);

  const apptIdMap = new Map<string, string>();
  existingApptRows.forEach((r: any) => apptIdMap.set(r.sf_id, r.id));

  // Looked up by billing rows below (Billing__c's Procedure_Type__c fields
  // are frequently blank - falling back to bare "Service" loses real
  // information the linked appointment already has) and by procedure rows
  // further down.
  const apptServiceBySfId = new Map<string, string>();
  const apptDoctorBySfId = new Map<string, string>();
  appts.forEach((a) => {
    // Resolved to a real service name for the same reason as the appointment
    // itself - this map feeds invoice and procedure service_name columns.
    const svc = serviceFor(a.Investigation__c || a.Description__c);
    if (svc) apptServiceBySfId.set(a.Id, String(svc));
    if (a.Doctor_Name__c) apptDoctorBySfId.set(a.Id, String(a.Doctor_Name__c));
  });

  const mapAppt = (a: any) => {
    const start = a.Start_Time__c || a.CreatedDate;
    const end = a.End_Time__c || (start ? new Date(new Date(start).getTime() + 5 * 60000).toISOString() : new Date().toISOString());
    // Completed/No Show mean the visit actually happened (or was missed) -
    // never stamp either on an appointment whose start_time hasn't arrived
    // yet, no matter what Salesforce's own status field said.
    const isFuture = new Date(start) > new Date();
    const statusMap: Record<string, string> = {
      Confirmed: "Confirmed", Completed: "Completed", "No Show": "No Show",
      Cancelled: "Cancelled", Scheduled: "Confirmed", Rescheduled: "Confirmed",
    };
    let status = statusMap[a.Appointment_Status__c] || (isFuture ? "Confirmed" : "Completed");
    if (isFuture && (status === "Completed" || status === "No Show")) status = "Confirmed";
    const rawService = a.Investigation__c || a.Description__c;
    const service = serviceFor(rawService) || "Consultation";
    return {
      patient_id: p.lovable_id,
      patient_name: p.name,
      service: String(service).slice(0, 500),
      start_time: start,
      end_time: end,
      status,
      appointment_type: a.Visit_Type__c || a.Appointment_type__c || "Walk-in",
      reason_for_consultation: `${rawService || ""}${a.Doctor_Name__c ? ` (Dr. ${a.Doctor_Name__c})` : ""}`.trim() || null,
      source: "salesforce",
      staff_id: doctorFor(a.Doctor_Name__c),
      sf_id: a.Id,
      created_at: a.CreatedDate,
      updated_at: a.CreatedDate,
    };
  };

  const newAppts = appts.filter((a) => !existingAppts.has(a.Id));
  const seenAppts = appts.filter((a) => existingAppts.has(a.Id));
  const apptRows = newAppts.map(mapAppt);

  for (const batch of chunk(apptRows, 100)) {
    const { data, error } = await admin.from("appointments").insert(batch).select("id, sf_id");
    if (error) throw new Error(`appointments insert: ${error.message}`);
    (data || []).forEach((row: any) => apptIdMap.set(row.sf_id, row.id));
    log.appointments += batch.length;
  }

  // Already-imported appointments: refresh only the columns Salesforce owns,
  // so a reschedule, a status change (including Cancelled) or a changed
  // service in Salesforce is reflected here. Everything the app owns
  // (next visit, owner, notes typed here, linked invoice/procedure) is left
  // untouched.
  //
  // reason_for_consultation is refreshed alongside service, and must stay that
  // way: service now holds a resolved service name rather than the raw
  // Investigation__c/Description__c text, so this column is the only place that
  // text survives in the app. Refreshing one without the other would drop it for
  // any appointment whose text came from Description__c - those carry just
  // "(Dr. Whoever)" in reason, so there would be nothing left to read.
  if (refreshExisting) {
    for (const a of seenAppts) {
      const row = mapAppt(a);
      const { error } = await admin
        .from("appointments")
        .update({
          start_time: row.start_time,
          end_time: row.end_time,
          status: row.status,
          service: row.service,
          reason_for_consultation: row.reason_for_consultation,
          staff_id: row.staff_id,
          appointment_type: row.appointment_type,
        })
        .eq("sf_id", a.Id);
      if (error) throw new Error(`appointments update: ${error.message}`);
      log.updated = (log.updated || 0) + 1;
    }
  } else {
    log.skipped += seenAppts.length;
  }


  const newBillings = billings.filter((b) => !existingInvoices.has(b.Id));
  log.skipped += billings.length - newBillings.length;
  const invRows = newBillings.map((b) => {
    const services = [b.Procedure_Type__c, b.Procedure_Type_2__c, b.Procedure_Type_3__c].filter(Boolean);
    const fallbackName = (b.Appointment__c && apptServiceBySfId.get(b.Appointment__c)) || "Service";
    const names = services.length ? services : [fallbackName];
    const total = Number(b.Total_Amount__c || b.Total_Price__c || 0);
    const taxRate = Number(b.GST__c || 0);
    // Billing__c has no per-line item breakdown (Procedure_Type__c etc. are
    // just names, no price/HSN) and no separate CGST/SGST fields. total is
    // tax-INCLUSIVE (it's what total_amount/paid_amount store directly), so
    // the pre-tax base must come from the GST rate algebraically
    // (base * (1+rate/100) = total) rather than by subtracting
    // Total_Tax_Applicable__c, which Salesforce doesn't always populate even
    // when GST__c (the rate) is set - subtracting a missing/zero tax figure
    // would leave line_items.price at the full total, then applying gst on
    // top of that later (client/PDF) would double-count the tax. Derive tax
    // amount the same way when SF didn't supply one, and split it 50/50 as
    // CGST+SGST (this clinic's own convention for GST elsewhere - see
    // tax_master) rather than leaving no per-tax-head breakdown.
    const explicitTax = Number(b.Total_Tax_Applicable__c || 0);
    const base = taxRate > 0 ? total / (1 + taxRate / 100) : Math.max(total - explicitTax, 0);
    const taxAmount = taxRate > 0 ? total - base : explicitTax;
    const lineItems = names.map((name: string) => ({ name, qty: 1, price: base / names.length, hsn: "", gst: taxRate }));
    return {
      invoice_number: b.Name,
      patient_id: p.lovable_id,
      patient_name: p.name,
      services: names,
      line_items: lineItems,
      total_amount: total,
      paid_amount: total, // SF billings are historical/paid
      status: total > 0 ? "Paid" : "Pending",
      payment_type: "One-time",
      payment_mode: b.Payment_Mode__c || "Cash",
      tax_rate: taxRate,
      tax_amount: taxAmount,
      cgst_amount: taxAmount / 2,
      sgst_amount: taxAmount / 2,
      appointment_id: b.Appointment__c ? apptIdMap.get(b.Appointment__c) || null : null,
      doctor_id: doctorFor(b.Doctor_Name__c),
      notes: b.Doctor_Name__c ? `Doctor: ${b.Doctor_Name__c}` : null,
      sf_id: b.Id,
      created_at: b.CreatedDate,
      updated_at: b.CreatedDate,
    };
  });
  for (const batch of chunk(invRows, 100)) {
    const { error } = await admin.from("invoices").insert(batch);
    if (error) throw new Error(`invoices insert: ${error.message}`);
    log.invoices += batch.length;
  }

  const billingProcBySfApptId = new Map<string, string>();
  billings.forEach((b) => {
    if (b.Appointment__c) {
      const proc = [b.Procedure_Type__c, b.Procedure_Type_2__c, b.Procedure_Type_3__c].filter(Boolean).join(", ");
      if (proc) billingProcBySfApptId.set(b.Appointment__c, proc);
    }
  });

  const newDiagnoses = diagnoses.filter((d) => !existingProcs.has(d.Id));
  log.skipped += diagnoses.length - newDiagnoses.length;
  const procRows = newDiagnoses.map((d) => {
    const treatment = d.Treatment__c ? String(d.Treatment__c).replace(/;/g, ", ") : null;
    const serviceName =
      treatment ||
      d.Procedure_Type__c ||
      d.Service_Type__c ||
      (d.Appointment__c && billingProcBySfApptId.get(d.Appointment__c)) ||
      (d.Appointment__c && apptServiceBySfId.get(d.Appointment__c)) ||
      d.Type_Of_Appointment__c ||
      "Consultation";
    const symptoms = [d.Symptoms__c, d.Symptoms_all__c && d.Symptoms_all__c !== d.Symptoms__c ? d.Symptoms_all__c : null]
      .filter(Boolean).join("\n") || null;
    const consultationParts = [
      d.Advice__c && `Advice: ${d.Advice__c}`,
      d.Dietary_Advice__c && `Dietary Advice: ${d.Dietary_Advice__c}`,
      d.History__c && `History: ${d.History__c}`,
      d.Required_Lab_Test_s__c && `Lab Tests: ${d.Required_Lab_Test_s__c}`,
      d.Payment_Instruction__c && `Payment Instruction: ${d.Payment_Instruction__c}`,
      d.Consultation_Fee__c ? `Consultation Fee: ₹${d.Consultation_Fee__c}` : null,
    ].filter(Boolean);
    const reviewBits = [
      d.Review__c && `Review: ${d.Review__c}`,
      d.Visit_type__c && `Visit Type: ${d.Visit_type__c}`,
      d.Type_Of_Appointment__c && `Type: ${d.Type_Of_Appointment__c}`,
      d.Follow_Up_Date__c && `Follow-Up: ${d.Follow_Up_Date__c}`,
    ].filter(Boolean);
    return {
      patient_id: p.lovable_id,
      service_name: String(serviceName).slice(0, 500),
      procedure_date: d.CreatedDate,
      status: "Completed",
      appointment_id: d.Appointment__c ? apptIdMap.get(d.Appointment__c) || null : null,
      // Diagnosis__c carries no doctor field of its own - borrow it from the
      // linked appointment, same as invoices already do for Billing__c.
      staff_id: d.Appointment__c ? doctorFor(apptDoctorBySfId.get(d.Appointment__c) || null) : null,
      diagnosis: [d.Diagnosis__c, d.Diagnoses__c].filter(Boolean).join("\n") || null,
      symptoms,
      procedure_notes: d.Prescription__c || null,
      consultation_notes: consultationParts.length ? consultationParts.join("\n") : null,
      recommendations: d.Special_Instructions__c || null,
      review_notes: reviewBits.length ? reviewBits.join(" | ") : null,
      sf_id: d.Id,
      created_at: d.CreatedDate,
      updated_at: d.CreatedDate,
    };
  });
  for (const batch of chunk(procRows, 100)) {
    const { error } = await admin.from("procedures").insert(batch);
    if (error) throw new Error(`procedures insert: ${error.message}`);
    log.procedures += batch.length;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const only = url.searchParams.get("only") || "";
  // A caller may still send the legacy `limit=60`; cap every invocation to a
  // request-sized batch. The sync is checkpointed per patient, so subsequent
  // calls continue with the next pending patients without losing progress.
  const requestedLimit = Math.max(1, Number(url.searchParams.get("limit") || "20"));
  const limit = Math.min(20, requestedLimit);
  const reset = url.searchParams.get("reset") === "true";
  const mode = url.searchParams.get("mode") || "";
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));

  const results: any[] = [];
  try {
    let targets: Target[];
    let recentInfo: { total: number; unmatched: number; sfPatients: number; created: number; nextOffset: number | null } | null = null;
    let windowFrom: string | null = null;
    let windowTo: string | null = null;

    if (mode === "recent") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      if (!from || !to) throw new Error("mode=recent requires from and to ISO datetimes");
      // SOQL datetime literals are unquoted and must not carry milliseconds.
      const sfTime = (v: string) => new Date(v).toISOString().replace(/\.\d{3}Z$/, "Z");
      const fromIso = sfTime(from);
      const toIso = sfTime(to);
      windowFrom = fromIso;
      windowTo = toIso;
      const found = await fetchRecentTargets(fromIso, toIso);
      const slice = found.targets.slice(offset, offset + limit);
      const next = offset + slice.length;
      recentInfo = {
        total: found.targets.length,
        unmatched: found.unmatched,
        sfPatients: found.sfPatients,
        created: found.createdPatients,
        nextOffset: next < found.targets.length ? next : null,
      };
      targets = slice;
    } else {
      targets = await fetchTargets(only, limit);
    }

    const doctorFor = await buildDoctorMap();
    const serviceFor = await buildServiceMatcher();

    if (reset && only) {
      await admin.from("patients").update({ sf_clinical_synced_at: null }).in("id", targets.map((t) => t.lovable_id));
    }


    // Patients are independent - process several concurrently rather than
    // one at a time, capped to stay within Salesforce API burst limits.
    // Hard time budget: merely refusing to start new work is not enough,
    // because an already-running Salesforce request can remain in flight
    // until the platform's 150s idle timeout. Stop scheduling at 90s and
    // abort every individual patient's Salesforce calls after at most 20s.
    const deadline = Date.now() + 90_000;
    let stoppedEarly = false;
    await mapPool(targets, 8, async (p) => {
      if (Date.now() > deadline) { stoppedEarly = true; return; }
      const log: any = { patient: p.name, appointments: 0, updated: 0, invoices: 0, procedures: 0, skipped: 0, errors: [] as any[] };
      const remainingMs = Math.max(1, deadline - Date.now());
      const patientTimeoutMs = Math.min(20_000, remainingMs);
      try {
        await syncPatient(p, doctorFor, serviceFor, reset, log, AbortSignal.timeout(patientTimeoutMs), mode === "recent");
        if (!only && mode !== "recent") {
          await admin.from("patients").update({ sf_clinical_synced_at: new Date().toISOString() }).eq("id", p.lovable_id);
        }

      } catch (e) {
        const message = (e as Error).name === "TimeoutError" || (e as Error).name === "AbortError"
          ? `Patient sync exceeded ${Math.ceil(patientTimeoutMs / 1000)}s and was safely deferred`
          : (e as Error).message;
        log.errors.push(message);
      }
      results.push(log);
    });

    // Deletion reconciliation: only once the whole window has been walked
    // (otherwise appointments belonging to patients not yet processed would
    // look "missing"). Anything still sitting in the window here that no
    // longer exists in Salesforce is marked Cancelled rather than deleted.
    let cancelledMissing = 0;
    if (mode === "recent" && recentInfo && recentInfo.nextOffset === null && !stoppedEarly && windowFrom && windowTo) {
      const sfRows = await sfQuery(`SELECT Id FROM Appointment__c WHERE Start_Time__c >= ${windowFrom} AND Start_Time__c <= ${windowTo}`);
      const sfSet = new Set(sfRows.map((r: any) => String(r.Id)));
      const { data: localRows } = await admin
        .from("appointments")
        .select("id, sf_id, status")
        .not("sf_id", "is", null)
        .gte("start_time", new Date(windowFrom).toISOString())
        .lte("start_time", new Date(windowTo).toISOString());
      const stale = (localRows || []).filter((r: any) => !sfSet.has(r.sf_id) && r.status !== "Cancelled");
      for (const batch of chunk(stale.map((r: any) => r.id), 100)) {
        if (!batch.length) continue;
        const { error } = await admin
          .from("appointments")
          .update({ status: "Cancelled" })
          .in("id", batch);
        if (error) throw new Error(`appointments cancel: ${error.message}`);
        cancelledMissing += batch.length;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed: results.length,
        requested: requestedLimit,
        batch_size: targets.length,
        capped: requestedLimit > limit,
        stopped_early: stoppedEarly,
        mode: mode || "backlog",
        recent_total_patients: recentInfo?.total ?? null,
        recent_unmatched_patients: recentInfo?.unmatched ?? null,
        recent_created_patients: recentInfo?.created ?? null,
        recent_cancelled_missing: mode === "recent" ? cancelledMissing : null,
        next_offset: mode === "recent" ? (stoppedEarly ? offset + results.length : recentInfo?.nextOffset ?? null) : null,
        results,
      }, null, 2),


      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (e) {
    console.error("sf-import-clinical failed:", e);
    return new Response(
      JSON.stringify({ ok: false, error: (e as Error).message, results }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
