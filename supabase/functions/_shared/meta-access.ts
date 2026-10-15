import { createClient } from "npm:@supabase/supabase-js@2";

/** True when the staff member's role name contains admin or manager. */
export async function isAdminOrManager(staffId: string): Promise<boolean> {
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data } = await db
    .from("staff")
    .select("user_roles_config(name)")
    .eq("id", staffId)
    .maybeSingle();
  const cfg = (data as { user_roles_config?: { name?: string } | { name?: string }[] | null } | null)?.user_roles_config;
  const name = Array.isArray(cfg) ? cfg[0]?.name : cfg?.name;
  return /admin|manager/i.test(name ?? "");
}

/** Actions that publish, spend, delete or change the live Meta account. */
export const PRIVILEGED_ACTION = /^(publish_|resume_|delete_|archive_|diagnostic_lifecycle_|register_ad_|refresh_custom_audience)|^(create_customer_list_audience|create_lead_form|disconnect)$/;
