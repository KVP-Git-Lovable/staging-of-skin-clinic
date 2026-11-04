// One-off cleanup helper: removes duplicate Salesforce-imported rows listed in
// public._appt_dupes / _inv_dupes / _proc_dupes (created when the catch-up sync
// ran with several workers at once). Deletes in small batches inside a time
// budget; call repeatedly until done.
//   what = appointments | invoices | procedures
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const SETS: Record<string, { table: string; dupes: string }> = {
  appointments: { table: "appointments", dupes: "_appt_dupes" },
  invoices: { table: "invoices", dupes: "_inv_dupes" },
  procedures: { table: "procedures", dupes: "_proc_dupes" },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const what = new URL(req.url).searchParams.get("what") || "appointments";
  const set = SETS[what];
  if (!set) {
    return new Response(JSON.stringify({ ok: false, error: `unknown what=${what}` }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const deadline = Date.now() + 100_000;
  let deleted = 0;
  let done = false;
  try {
    while (Date.now() < deadline) {
      const { data, error } = await admin.from(set.dupes).select("dup_id").limit(200);
      if (error) throw new Error(error.message);
      const ids = (data || []).map((r: any) => r.dup_id);
      if (!ids.length) { done = true; break; }
      const del = await admin.from(set.table).delete().in("id", ids);
      if (del.error) throw new Error(del.error.message);
      const clean = await admin.from(set.dupes).delete().in("dup_id", ids);
      if (clean.error) throw new Error(clean.error.message);
      deleted += ids.length;
    }
    return new Response(JSON.stringify({ ok: true, what, deleted, done }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message, deleted }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
