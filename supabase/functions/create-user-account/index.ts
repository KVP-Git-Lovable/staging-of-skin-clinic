import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

      const newPassword = password || crypto.randomUUID().slice(0, 12) + "A1!";

      const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_user_id, {
        password: newPassword,
      });

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ success: true, password_was_auto: !password }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    const userPassword = password || crypto.randomUUID().slice(0, 12) + "A1!";

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

    return new Response(
      JSON.stringify({ success: true, auth_user_id: authUserId, password_sent: send_email && !password }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
