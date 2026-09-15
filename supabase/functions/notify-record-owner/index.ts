import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await authClient.auth.getUser(token);
    const actor = userData?.user;
    if (userError || !actor) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => null);
    const newOwnerId = typeof body?.new_owner_id === "string" ? body.new_owner_id : "";
    const objectLabel = String(body?.object_label ?? "Record").slice(0, 60);
    const objectType = String(body?.object_type ?? "").slice(0, 60);
    const recordLabel = String(body?.record_label ?? "").slice(0, 200);
    const recordId = typeof body?.record_id === "string" ? body.record_id : null;
    const link = typeof body?.link === "string" ? body.link.slice(0, 300) : null;
    const notifyApp = body?.notify_app !== false;
    const notifyEmail = body?.notify_email === true;

    if (!newOwnerId) return json({ error: "new_owner_id is required" }, 400);

    const admin = createClient(supabaseUrl, serviceKey);

    const { data: actorStaff } = await admin
      .from("staff")
      .select("first_name, last_name")
      .eq("auth_user_id", actor.id)
      .maybeSingle();
    const actorName =
      `${actorStaff?.first_name ?? ""} ${actorStaff?.last_name ?? ""}`.trim() || actor.email || "A colleague";

    const title = `You are now the owner of a ${objectLabel.toLowerCase()}`;
    const text = `${actorName} assigned ${objectLabel.toLowerCase()}${recordLabel ? ` "${recordLabel}"` : ""} to you.`;

    let appNotified = false;
    if (notifyApp) {
      const { error } = await admin.from("notifications").insert({
        user_id: newOwnerId,
        title,
        body: text,
        object_type: objectType || null,
        record_id: recordId,
        link,
        created_by: actor.id,
      });
      if (error) console.error("notification insert failed", error.message);
      else appNotified = true;
    }

    let emailSent = false;
    let emailError: string | null = null;
    if (notifyEmail) {
      const resendKey = Deno.env.get("RESEND_API_KEY");
      const { data: ownerStaff } = await admin
        .from("staff")
        .select("email, first_name")
        .eq("auth_user_id", newOwnerId)
        .maybeSingle();
      const to = ownerStaff?.email;

      if (!resendKey) emailError = "Email sending is not configured";
      else if (!to) emailError = "The new owner has no email address on file";
      else {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: Deno.env.get("OWNER_NOTIFICATION_FROM") ?? "The Skin Clinic <onboarding@resend.dev>",
            to: [to],
            subject: title,
            html: `<p>Hi ${ownerStaff?.first_name ?? "there"},</p>
                   <p>${text}</p>
                   ${link ? `<p><a href="${link}">Open the record</a></p>` : ""}
                   <p>— The Skin Clinic</p>`,
          }),
        });
        if (res.ok) emailSent = true;
        else emailError = await res.text();
      }
      if (emailError) console.error("owner email failed:", emailError);
    }

    return json({ ok: true, app_notified: appNotified, email_sent: emailSent, email_error: emailError });
  } catch (e) {
    console.error("notify-record-owner error", e);
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
