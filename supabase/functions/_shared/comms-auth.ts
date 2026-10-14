import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

export { corsHeaders };

// Resolves to null when the caller is a signed-in staff member; otherwise the
// error Response to return. Patient-portal users also hold auth sessions, so
// a valid JWT alone is not enough.
export async function requireStaffId(req: Request): Promise<{ staffId: string } | Response> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) return json({ error: "Unauthorized" }, 401);

  const url = Deno.env.get("SUPABASE_URL")!;
  const authClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: staff } = await admin
    .from("staff")
    .select("id")
    .eq("auth_user_id", data.user.id)
    .maybeSingle();
  if (!staff) return json({ error: "Forbidden" }, 403);
  return { staffId: staff.id as string };
}

export async function requireStaff(req: Request): Promise<Response | null> {
  const result = await requireStaffId(req);
  return result instanceof Response ? result : null;
}

export function twilioCreds(): { sid: string; auth: string } | null {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!sid || !token) return null;
  return { sid, auth: `Basic ${btoa(`${sid}:${token}`)}` };
}
