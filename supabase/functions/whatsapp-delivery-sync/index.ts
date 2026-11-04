// Pulls the WhatsApp messages the clinic has sent out of Twilio's send history
// and records each one (with its latest delivery status) in
// whatsapp_delivery_log, matched to the patient by phone number.
// Safe to re-run: rows are upserted by Twilio message SID.
//
// It used to keep only appointment confirmations, which is why the patient's
// conversation thread opened on them replying "Confirm" to nothing: the invoice,
// the prescription and the survey they had received were never written down.
// Everything the clinic sends is recorded now, tagged by what it is, and the
// whole body is kept rather than the first 200 characters, because the
// conversation screen shows these messages as the patient read them.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const Body = z.object({
  days: z.number().int().min(1).max(400).optional(),
  // Walk further back in chunks: ask for the days BEFORE this instant. Twilio
  // hands back the newest first, so a long backfill is several calls.
  until: z.string().datetime().optional(),
}).optional();

/** What a sent message is, read off the template the clinic used. */
function kindOf(body: string): string {
  const b = body.toLowerCase();
  if (b.includes("you have an appointment")) return "confirmation";
  if (b.includes("rescheduled") || b.includes("has been moved")) return "reschedule";
  if (b.includes("invoice") || b.includes("bill")) return "invoice";
  if (b.includes("prescription")) return "prescription";
  if (b.includes("survey") || b.includes("feedback")) return "survey";
  return "message";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error: uErr } = await admin.auth.getUser(token);
    if (uErr || !u?.user) return json({ error: "Unauthorized" }, 401);

    let raw: unknown = undefined;
    try { raw = await req.json(); } catch { /* empty body ok */ }
    const parsed = Body.safeParse(raw);
    if (!parsed.success) return json({ error: parsed.error.flatten() }, 400);
    const days = parsed.data?.days ?? 3;
    const until = parsed.data?.until ? new Date(parsed.data.until) : null;

    const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const tok = Deno.env.get("TWILIO_AUTH_TOKEN");
    if (!sid || !tok) return json({ error: "WhatsApp service not configured" }, 500);
    const auth = "Basic " + btoa(`${sid}:${tok}`);

    // Only what the clinic itself sent.
    //
    // This asked Twilio for every message on the account and took the lot. The
    // account is shared with other businesses, so a jewellery shop's Diwali
    // campaign, a field-sales app's order confirmations and another bot's
    // replies all landed in the clinic's delivery log and showed up in the
    // conversation screen beside patients - 8,700 of 9,565 rows by the time it
    // was noticed, carrying other companies' customers' phone numbers into a
    // database they have no business being in.
    //
    // The sender is the one thing that distinguishes them, so it is asked for
    // rather than filtered afterwards: a guess at the wording would let the
    // next unfamiliar template straight back in.
    const fromNumber = Deno.env.get("TWILIO_WHATSAPP_FROM");
    if (!fromNumber) return json({ error: "WhatsApp sender not configured" }, 500);
    const fromParam = encodeURIComponent(
      fromNumber.startsWith("whatsapp:") ? fromNumber : `whatsapp:${fromNumber}`,
    );

    const anchor = until ? until.getTime() : Date.now();
    const since = new Date(anchor - days * 86400000).toISOString().slice(0, 10);
    let next: string | null =
      `/2010-04-01/Accounts/${sid}/Messages.json?PageSize=500&From=${fromParam}&DateSent%3E=${since}` +
      (until ? `&DateSent%3C=${until.toISOString().slice(0, 10)}` : "");
    const started = Date.now();
    const rows: any[] = [];
    while (next && Date.now() - started < 45000) {
      const res = await fetch(`https://api.twilio.com${next}`, { headers: { Authorization: auth } });
      const text = await res.text();
      if (!res.ok) {
        console.error(`Twilio list failed [${res.status}]: ${text}`);
        return json({ error: "Could not read WhatsApp history", status: res.status, details: text }, res.status >= 500 ? 502 : res.status);
      }
      const page = JSON.parse(text);
      for (const m of page.messages || []) {
        if (m.direction === "inbound") continue;
        // WhatsApp only - a plain SMS does not belong in a WhatsApp thread.
        if (!String(m.to || "").startsWith("whatsapp:")) continue;
        // Twilio's From filter is asked for above, but the answer is checked
        // too: the businesses on this account may yet come to share a sender,
        // and a page fetched from next_page_uri carries the query Twilio built,
        // not the one written here.
        const sentFrom = String(m.from || "").replace(/^whatsapp:/, "");
        if (sentFrom && sentFrom !== fromNumber.replace(/^whatsapp:/, "")) continue;
        const body = String(m.body || "");
        rows.push({
          message_sid: m.sid,
          phone: String(m.to || "").replace(/^whatsapp:/, ""),
          kind: kindOf(body),
          body_preview: body.slice(0, 4000),
          status: m.status,
          error_code: m.error_code ? Number(m.error_code) : null,
          error_message: m.error_message || null,
          sent_at: new Date(m.date_sent || m.date_created).toISOString(),
          updated_at: new Date().toISOString(),
        });
      }
      next = page.next_page_uri || null;
    }

    // Match phones to patients by last 10 digits. A family shares one phone, so
    // a number can belong to several patients - the message itself says which
    // one it was for ("Hello Ms. Pallavi"), so read the name off the body
    // before falling back to whoever was registered first.
    type Candidate = { id: string; first_name: string | null; last_name: string | null };
    const last10s = [...new Set(rows.map((r) => r.phone.replace(/\D/g, "").slice(-10)).filter((p) => p.length === 10))];
    const byPhone = new Map<string, Candidate[]>();
    for (let i = 0; i < last10s.length; i += 10) {
      await Promise.all(last10s.slice(i, i + 10).map(async (p) => {
        const { data } = await admin
          .from("patients")
          .select("id, first_name, last_name")
          .ilike("phone", `%${p}`)
          .order("created_at", { ascending: true })
          .limit(10);
        if (data?.length) byPhone.set(p, data as Candidate[]);
      }));
    }
    for (const r of rows) {
      const candidates = byPhone.get(r.phone.replace(/\D/g, "").slice(-10)) ?? [];
      if (candidates.length <= 1) {
        r.patient_id = candidates[0]?.id ?? null;
        continue;
      }
      const body = String(r.body_preview || "").toLowerCase();
      const named = candidates.find((c) => {
        const name = `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim().toLowerCase();
        return name.length >= 3 && body.includes(name);
      }) ?? candidates.find((c) => {
        const first = (c.first_name ?? "").trim().toLowerCase();
        return first.length >= 3 && body.includes(first);
      });
      r.patient_id = (named ?? candidates[0]).id;
    }

    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await admin.from("whatsapp_delivery_log").upsert(rows.slice(i, i + 500), { onConflict: "message_sid" });
      if (error) { console.error("upsert failed", error); return json({ error: error.message }, 500); }
    }
    return json({ synced: rows.length, matched: rows.filter((r) => r.patient_id).length, complete: !next });
  } catch (e) {
    console.error("whatsapp-delivery-sync error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
