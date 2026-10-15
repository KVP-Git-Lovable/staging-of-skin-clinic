import { supabase } from "@/integrations/supabase/client";

export type MetaAdAccount = { ad_account_id: string; name: string; account_status?: string | number | null };

export type MetaScope = {
  connected: boolean;
  connectionId: string | null;
  campaigns: any[];
  campaignIds: Set<string>;
  /** Ad accounts of the connected login (same list as "Default Ad Account" on the Meta page). */
  adAccounts: MetaAdAccount[];
};

const bare = (v: unknown) => String(v ?? "").replace(/^act_/, "").trim();
/** Ad account id without the "act_" prefix, for comparisons across tables. */
export const bareAdAccountId = bare;

/**
 * Loads the currently connected Meta account and the campaigns that belong to it.
 * Campaigns created under a different Meta login stay in the database but are
 * excluded, so the screens only ever show the signed-in account's data.
 */
export async function loadMetaScope(): Promise<MetaScope> {
  const empty: MetaScope = { connected: false, connectionId: null, campaigns: [], campaignIds: new Set(), adAccounts: [] };

  const { data: conn } = await supabase
    .from("social_connections")
    .select("id")
    .eq("platform", "meta")
    .maybeSingle();
  if (!conn) return empty;

  const { data: accounts } = await supabase
    .from("social_ad_accounts")
    .select("ad_account_id, name, account_status")
    .eq("connection_id", conn.id)
    .order("name");
  const accountIds = new Set((accounts || []).map((a: any) => bare(a.ad_account_id)).filter(Boolean));

  const { data: all } = await supabase
    .from("social_campaigns")
    .select("*")
    .eq("platform", "meta")
    .order("created_at", { ascending: false });

  const campaigns = (all || []).filter((c: any) => {
    if (c.connection_id && c.connection_id === conn.id) return true;
    if (c.ad_account_id) return accountIds.has(bare(c.ad_account_id));
    // Unassigned local draft — keep it visible.
    return !c.connection_id;
  });

  // Backfill the connection link on campaigns that clearly belong here.
  const missingLink = campaigns.filter((c: any) => !c.connection_id && c.ad_account_id).map((c: any) => c.id);
  if (missingLink.length) {
    await supabase.from("social_campaigns").update({ connection_id: conn.id }).in("id", missingLink);
    campaigns.forEach((c: any) => { if (!c.connection_id && c.ad_account_id) c.connection_id = conn.id; });
  }

  return {
    connected: true,
    connectionId: conn.id,
    campaigns,
    campaignIds: new Set(campaigns.map((c: any) => c.id)),
    adAccounts: ((accounts || []) as Array<{ ad_account_id: string | null; name: string | null; account_status: string | number | null }>)
      .filter((a) => !!a.ad_account_id)
      .map((a) => ({ ad_account_id: bare(a.ad_account_id), name: a.name || String(a.ad_account_id), account_status: a.account_status ?? null })),
  };
}
