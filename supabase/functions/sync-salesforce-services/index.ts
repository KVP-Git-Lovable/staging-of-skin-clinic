// Salesforce -> Service Master sync.
//
// Most Service__c templates in the connected org carry no notes at all - the
// clinical text the doctors actually write lives on the per-visit Diagnosis__c
// records, which have a Service__c lookup back to the template. So we read
// both: template fields win, and when a template field is empty we fall back
// to the most recent non-empty value across that service's linked visits.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GATEWAY_URL = "https://connector-gateway.lovable.dev/salesforce";

interface SalesforceServiceRaw {
  Id: string;
  Name: string;
  Product_Family__c?: string | null;
  Total_amount__c?: number | null;
  Diagnosis__c?: string | null;
  Symptoms__c?: string | null;
  Special_Instructions__c?: string | null;
  Prescription__c?: string | null;
  Dietary_Advice__c?: string | null;
  Product_Discription__c?: string | null;
  isActive__c?: boolean | null;
}

interface DiagnosisRaw {
  Id: string;
  Service__c?: string | null;
  Special_Instructions__c?: string | null;
  Advice__c?: string | null;
  Dietary_Advice__c?: string | null;
  Prescription__c?: string | null;
  CreatedDate?: string | null;
}

// Shape consumed by the app
interface SalesforceService {
  Id: string;
  Name: string;
  Category__c: string | null;
  Cost__c: number | null;
  Duration__c: number | null;
  Diagnosis__c: string | null;
  Symptoms__c: string | null;
  Procedure_Notes__c: string | null;
  Medicines__c: string | null;
  Recommendations__c: string | null;
  // "template" = value came from the Service__c record itself,
  // "visit" = derived from a linked past visit, "none" = nothing anywhere.
  Notes_Source__c: "template" | "visit" | "none";
}

function authHeaders() {
  const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
  const salesforceApiKey = Deno.env.get("SALESFORCE_API_KEY");
  if (!lovableApiKey || !salesforceApiKey) {
    throw new Error("Salesforce connector secrets are not configured");
  }
  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": salesforceApiKey,
    Accept: "application/json",
  };
}

// Follows nextRecordsUrl so a growing org never silently truncates at the
// 2000-record page boundary.
async function sfQuery<T>(soql: string): Promise<T[]> {
  const headers = authHeaders();
  const out: T[] = [];
  let url: string | null = `${GATEWAY_URL}/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const response: Response = await fetch(url, { method: "GET", headers });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Salesforce gateway request failed [${response.status}]: ${errorBody}`);
      throw new Error(`[${response.status}] ${errorBody}`);
    }
    const data: { records?: T[]; done?: boolean; nextRecordsUrl?: string } = await response.json();
    out.push(...(data.records || []));
    if (data.done || !data.nextRecordsUrl) break;
    url = `${GATEWAY_URL}${data.nextRecordsUrl.replace("/services/data/v62.0", "")}`;
  }
  return out;
}

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  // "none" / "na" are placeholders the clinic types when there is nothing to say.
  if (!s || ["none", "n/a", "na", "nil", "test", "-"].includes(s.toLowerCase())) return null;
  return s;
};

function formatVisitDate(iso: string | null | undefined): string {
  if (!iso) return "a past visit";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "a past visit";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function derived(text: string, iso: string | null | undefined): string {
  return `${text}\n\n(Imported from a past visit — ${formatVisitDate(iso)})`;
}

interface VisitFallback {
  notes?: { text: string; date: string | null };
  recommendations?: { text: string; date: string | null };
  prescription?: { text: string; date: string | null };
}

// Newest non-empty value per field, per service.
function buildVisitFallbacks(rows: DiagnosisRaw[]): Map<string, VisitFallback> {
  const sorted = [...rows].sort((a, b) =>
    String(b.CreatedDate || "").localeCompare(String(a.CreatedDate || "")),
  );
  const map = new Map<string, VisitFallback>();
  for (const r of sorted) {
    const key = r.Service__c;
    if (!key) continue;
    const entry = map.get(key) || {};
    const date = r.CreatedDate ?? null;

    const notes = clean(r.Special_Instructions__c);
    if (notes && !entry.notes) entry.notes = { text: notes, date };

    const advice = [clean(r.Dietary_Advice__c), clean(r.Advice__c)].filter(Boolean).join("\n");
    if (advice && !entry.recommendations) entry.recommendations = { text: advice, date };

    const rx = clean(r.Prescription__c);
    if (rx && !entry.prescription) entry.prescription = { text: rx, date };

    map.set(key, entry);
  }
  return map;
}

async function fetchSalesforceServices(): Promise<SalesforceService[]> {
  const [records, diagnoses] = await Promise.all([
    sfQuery<SalesforceServiceRaw>(
      "SELECT Id, Name, Product_Family__c, Total_amount__c, Diagnosis__c, Symptoms__c, Special_Instructions__c, Prescription__c, Dietary_Advice__c, Product_Discription__c, isActive__c FROM Service__c ORDER BY Name",
    ),
    sfQuery<DiagnosisRaw>(
      "SELECT Id, Service__c, Special_Instructions__c, Advice__c, Dietary_Advice__c, Prescription__c, CreatedDate FROM Diagnosis__c WHERE Service__c != null ORDER BY CreatedDate DESC",
    ),
  ]);

  const fallbacks = buildVisitFallbacks(diagnoses);

  const mapped = records.map((r) => {
    const fb = fallbacks.get(r.Id);

    const templateNotes = clean(r.Special_Instructions__c) ?? clean(r.Product_Discription__c);
    const templateRecs = clean(r.Dietary_Advice__c);
    const templateRx = clean(r.Prescription__c);

    const notes = templateNotes ?? (fb?.notes ? derived(fb.notes.text, fb.notes.date) : null);
    const recs =
      templateRecs ?? (fb?.recommendations ? derived(fb.recommendations.text, fb.recommendations.date) : null);
    const rx = templateRx ?? (fb?.prescription ? derived(fb.prescription.text, fb.prescription.date) : null);

    const hasTemplate = Boolean(templateNotes || templateRecs || templateRx);
    const hasAny = Boolean(notes || recs || rx);

    return {
      Id: r.Id,
      Name: r.Name,
      Category__c: r.Product_Family__c ?? null,
      Cost__c: r.Total_amount__c ?? null,
      Duration__c: null,
      Diagnosis__c: r.Diagnosis__c ?? null,
      Symptoms__c: r.Symptoms__c ?? null,
      Procedure_Notes__c: notes,
      Medicines__c: rx,
      Recommendations__c: recs,
      Notes_Source__c: (hasTemplate ? "template" : hasAny ? "visit" : "none") as
        | "template"
        | "visit"
        | "none",
    };
  });

  // Salesforce holds duplicate template names ("acne grade 4" twice,
  // "Hair fall"/"hair fall"). They all collapse onto one local row, so keep
  // the one that actually carries content instead of whichever arrives first.
  const byName = new Map<string, SalesforceService>();
  const rank = (s: SalesforceService) => (s.Notes_Source__c === "template" ? 2 : s.Notes_Source__c === "visit" ? 1 : 0);
  for (const s of mapped) {
    const key = s.Name.trim().toLowerCase();
    const existing = byName.get(key);
    if (!existing || rank(s) > rank(existing)) byName.set(key, s);
  }
  return [...byName.values()].sort((a, b) => a.Name.localeCompare(b.Name));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const services = await fetchSalesforceServices();
    const stats = {
      total: services.length,
      from_template: services.filter((s) => s.Notes_Source__c === "template").length,
      from_visits: services.filter((s) => s.Notes_Source__c === "visit").length,
      no_content: services.filter((s) => s.Notes_Source__c === "none").length,
    };
    console.log("sync-salesforce-services stats", JSON.stringify(stats));

    return new Response(JSON.stringify({ success: true, services, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});
