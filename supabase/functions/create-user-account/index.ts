import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * A temporary password somebody will have to read off a screen and type.
 *
 * Was `crypto.randomUUID().slice(0, 12) + "A1!"` - hex, four bits a
 * character, with a fixed tail that told anyone who saw two of them how the
 * rest were shaped. It never mattered while the password was thrown away
 * unseen; it does now that it is handed over. No O/0 or l/1/I, because it
 * gets read aloud. Mirrors src/lib/tempPassword.ts, which is the tested copy
 * - Deno functions cannot import from src/.
 */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

function randomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}
const pick = (from: string) => from[randomIndex(from.length)];

function generateTempPassword(length = 14): string {
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALPHABET));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    /**
     * Who is asking.
     *
     * This function had no caller check at all: it built a service-role
     * client and acted on the request body. It is not in config.toml, so it
     * inherited verify_jwt = true - which means A valid JWT, not an ADMIN
     * one. Every signed-in therapist, nurse and receptionist could call it
     * with action: "reset_password" and an admin's auth_user_id and take
     * that account over; delete_user was open the same way.
     *
     * Same shape as impersonate/index.ts, which got this right.
     */
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Please sign in" }, 401);

    const { data: caller, error: callerError } = await supabaseAdmin.auth.getUser(token);
    if (callerError || !caller?.user) return json({ error: "Please sign in" }, 401);

    const { data: callerStaff } = await supabaseAdmin
      .from("staff")
      .select("id, is_active, user_roles_config(name)")
      .eq("auth_user_id", caller.user.id)
      .maybeSingle();

    const callerRole = (callerStaff as { user_roles_config?: { name?: string } | null } | null)
      ?.user_roles_config?.name ?? "";
    const isAdmin =
      !!callerStaff &&
      (callerStaff as { is_active?: boolean }).is_active !== false &&
      callerRole.toLowerCase() === "admin";

    if (!isAdmin) {
      return json({ error: "Only an admin can create or change staff logins" }, 403);
    }

    const body = await req.json();
    const { action } = body;

    // Reset password action
    if (action === "reset_password") {
      const { auth_user_id, password } = body;
      if (!auth_user_id) {
        return new Response(JSON.stringify({ error: "auth_user_id is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const newPassword = password || generateTempPassword();

      const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_user_id, {
        password: newPassword,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // The generated one goes back, because nothing else knows it and
      // Supabase keeps only the hash. One the admin typed does not - they
      // already have it, and echoing a secret nobody needs is free risk.
      return json({
        success: true,
        password_was_auto: !password,
        temp_password: password ? null : newPassword,
      });
    }

    // Delete user action
    if (action === "delete_user") {
      const { staff_id, auth_user_id } = body;

      // Delete auth user if exists
      if (auth_user_id) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(auth_user_id);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Delete staff record
      if (staff_id) {
        // Null out FK references first to avoid constraint violations
        await supabaseAdmin.from("appointments").update({ staff_id: null }).eq("staff_id", staff_id);
        const { error } = await supabaseAdmin.from("staff").delete().eq("id", staff_id);
        if (error) {
          return new Response(JSON.stringify({ error: error.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(
        JSON.stringify({ success: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Default: create user account
    const { staff_id, email, password, role_id, full_name, phone, send_email, force_password_change } = body;

    if (!email || !full_name) {
      return new Response(JSON.stringify({ error: "Email and full name are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userPassword = password || generateTempPassword();

    let authUserId: string;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: { full_name, phone },
    });

    if (authError) {
      // If user already exists, look them up and link instead of failing
      if (authError.message?.includes("already been registered")) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listData?.users?.find((u: any) => u.email === email);
        if (!existing) {
          return new Response(JSON.stringify({ error: "User exists but could not be found" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        authUserId = existing.id;
        // Update password if provided
        await supabaseAdmin.auth.admin.updateUserById(authUserId, {
          password: userPassword,
          user_metadata: { full_name, phone },
        });
      } else {
        return new Response(JSON.stringify({ error: authError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      authUserId = authData.user.id;
    }

    if (staff_id) {
      await supabaseAdmin.from("staff").update({
        auth_user_id: authUserId,
        role_id: role_id || null,
        force_password_change: force_password_change ?? true,
      }).eq("id", staff_id);
    }

    return json({
      success: true,
      auth_user_id: authUserId,
      password_sent: send_email && !password,
      temp_password: password ? null : userPassword,
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
