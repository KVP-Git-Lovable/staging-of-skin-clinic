import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** Comma/space/newline separated list of emails allowed to impersonate. Empty = nobody. */
function allowedEmails(): string[] {
  return (Deno.env.get("IMPERSONATION_ALLOWED_EMAILS") ?? "")
    .split(/[,\s;]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // --- Who is calling? Always from the bearer token, never from the body. ---
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ error: "Not signed in" }, 401);

    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    const caller = userData?.user;
    if (userErr || !caller) return json({ error: "Not signed in" }, 401);

    let body: any = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return json({ error: "Invalid request body" }, 400);
    }
    const action = String(body?.action ?? "");

    // --- Allow-list + admin check (server side, every single call). ---
    const list = allowedEmails();
    const callerEmail = (caller.email ?? "").toLowerCase();
    const onList = list.length > 0 && callerEmail !== "" && list.includes(callerEmail);

    const { data: callerStaff } = await admin
      .from("staff")
      .select("id, is_active, user_roles_config(name)")
      .eq("auth_user_id", caller.id)
      .maybeSingle();
    const callerRole = ((callerStaff as any)?.user_roles_config?.name ?? "").toLowerCase();
    const callerIsAdmin = callerStaff?.is_active !== false && callerRole === "admin";

    const permitted = onList && callerIsAdmin;

    if (action === "can_impersonate") {
      return json({ allowed: permitted });
    }

    if (action === "end") {
      // Close the most recent open session for this actor. The caller here is the
      // impersonated user, so accept the actor id from the body but only ever use
      // it to stamp ended_at - it grants nothing.
      const actorId = typeof body?.actor_user_id === "string" ? body.actor_user_id : null;
      if (actorId) {
        const { data: open } = await admin
          .from("impersonation_log")
          .select("id")
          .eq("actor_user_id", actorId)
          .is("ended_at", null)
          .order("started_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (open?.id) {
          await admin.from("impersonation_log").update({ ended_at: new Date().toISOString() }).eq("id", open.id);
        }
      }
      return json({ success: true });
    }

    if (action === "start") {
      if (!permitted) return json({ error: "You are not allowed to use this" }, 403);

      const targetAuthId = typeof body?.target_auth_user_id === "string" ? body.target_auth_user_id : "";
      if (!targetAuthId) return json({ error: "target_auth_user_id is required" }, 400);
      if (targetAuthId === caller.id) return json({ error: "That is already your own account" }, 400);

      const { data: targetStaff } = await admin
        .from("staff")
        .select("id, first_name, last_name, email, is_active")
        .eq("auth_user_id", targetAuthId)
        .maybeSingle();
      if (!targetStaff) return json({ error: "That user is not a staff account" }, 404);
      if (targetStaff.is_active === false) return json({ error: "That staff account is deactivated" }, 400);

      const { data: targetUser, error: targetErr } = await admin.auth.admin.getUserById(targetAuthId);
      const targetEmail = targetUser?.user?.email ?? targetStaff.email ?? "";
      if (targetErr || !targetEmail) return json({ error: "That user has no login e-mail" }, 400);

      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: targetEmail,
      });
      if (linkErr || !link?.properties?.hashed_token) {
        return json({ error: linkErr?.message ?? "Could not start the session" }, 400);
      }

      const targetName = `${targetStaff.first_name ?? ""} ${targetStaff.last_name ?? ""}`.trim() || targetEmail;

      await admin.from("impersonation_log").insert({
        actor_user_id: caller.id,
        actor_email: caller.email ?? null,
        target_user_id: targetAuthId,
        target_email: targetEmail,
        target_name: targetName,
      });

      return json({
        token_hash: link.properties.hashed_token,
        target_email: targetEmail,
        target_name: targetName,
      });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("impersonate error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
