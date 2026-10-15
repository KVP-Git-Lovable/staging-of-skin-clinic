import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/hooks/use-toast";
import { BackButton } from "@/components/shared/BackButton";
import { CheckCircle2, Facebook, Instagram, Loader2, Megaphone, RefreshCw, Unplug } from "lucide-react";
import { CONNECTION_COLUMNS, PAGE_COLUMNS } from "@/lib/metaColumns";

export interface MetaConnectionData {
  id: string;
  external_user_name: string | null;
  business_name: string | null;
  status: string;
  token_expires_at: string | null;
  default_page_id: string | null;
  default_instagram_id: string | null;
  default_ad_account_id: string | null;
  default_ad_instagram_id?: string | null;
  default_ad_instagram_username?: string | null;
  created_at?: string | null;
}

interface IgSyncResult {
  pages: Array<{ page_id: string; page_name: string | null; instagram_id: string | null; instagram_username: string | null; error: string | null }>;
  missing_permissions: string[];
  errors: string[];
}

interface AdInstagramAccount { ad_account_id: string; id: string; username: string | null; profile_pic: string | null }

// Connections made before this moment were granted without the lead-ads permissions.
const PERMISSIONS_UPDATED_AT = Date.parse("2026-09-30T12:25:00Z");

export default function MetaConnection() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conn, setConn] = useState<MetaConnectionData | null>(null);
  const [pages, setPages] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [defaults, setDefaults] = useState({ page: "", ig: "", ad: "", adIg: "" });
  const [adIgAccounts, setAdIgAccounts] = useState<AdInstagramAccount[]>([]);
  const [adIgLoading, setAdIgLoading] = useState(false);
  const [adIgError, setAdIgError] = useState<string>("");
  const [igSyncing, setIgSyncing] = useState(false);
  const [igSync, setIgSync] = useState<IgSyncResult | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: c } = await supabase
      .from("social_connections")
      .select(CONNECTION_COLUMNS)
      .eq("platform", "meta")
      .maybeSingle();
    setConn((c as any) ?? null);
    if (c) {
      const [{ data: p }, { data: a }] = await Promise.all([
        supabase.from("social_pages").select(PAGE_COLUMNS).eq("connection_id", c.id).order("page_name"),
        supabase.from("social_ad_accounts").select("*").eq("connection_id", c.id).order("name"),
      ]);
      setPages(p || []);
      setAccounts(a || []);
      setDefaults({
        page: (c as any).default_page_id || "",
        ig: (c as any).default_instagram_id || "",
        ad: (c as any).default_ad_account_id || "",
        adIg: c.default_ad_instagram_id || "",
      });
    } else {
      setPages([]);
      setAccounts([]);
      setDefaults({ page: "", ig: "", ad: "", adIg: "" });
      setAdIgAccounts([]);
      setAdIgError("");
      setIgSync(null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Instagram profiles usable as the ad identity for the chosen default ad account
  // (same list as Ads Manager → Identity → Instagram profile). Live from Meta.
  useEffect(() => {
    if (!conn || !defaults.ad) {
      setAdIgAccounts([]);
      setAdIgError("");
      setAdIgLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setAdIgLoading(true);
      setAdIgError("");
      try {
        const { data, error } = await supabase.functions.invoke("meta-api", {
          body: { action: "list_ad_instagram_accounts", payload: { ad_account_id: defaults.ad } },
        });
        if (cancelled) return;
        if (data?.code === "meta_not_connected") {
          setConn(null);
          setPages([]);
          setAccounts([]);
          setDefaults({ page: "", ig: "", ad: "", adIg: "" });
          setAdIgAccounts([]);
          setAdIgError("");
          setIgSync(null);
          return;
        }
        if (error || data?.error) {
          setAdIgError(error?.message || String(data?.error));
          setAdIgAccounts([]);
          return;
        }
        setAdIgAccounts((data?.accounts || []) as AdInstagramAccount[]);
        const first = (data?.errors || [])[0];
        if (first?.message) setAdIgError(String(first.message));
      } catch (error) {
        if (cancelled) return;
        setAdIgAccounts([]);
        setAdIgError(error instanceof Error ? error.message : "Could not load Instagram accounts");
      } finally {
        if (!cancelled) setAdIgLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn?.id, defaults.ad]);

  const connect = async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-oauth-start", {
        body: { origin: window.location.origin },
      });
      if (error) throw error;
      if (!data?.auth_url) throw new Error("Could not build the Facebook login URL");

      const popup = window.open(data.auth_url, "meta-oauth", "width=680,height=760");
      if (!popup) throw new Error("Please allow pop-ups to connect with Facebook");

      const onMessage = async (e: MessageEvent) => {
        if (e.origin !== window.location.origin || e.source !== popup) return;
        if (e.data?.source !== "meta-oauth") return;
        window.removeEventListener("message", onMessage);
        setConnecting(false);
        if (e.data.ok) {
          toast({ title: "Connected successfully", description: "Your Meta Business account is linked." });
          const warned = Object.keys(e.data.instagram_warnings || {});
          if (warned.length) {
            toast({
              title: "Instagram accounts could not be read",
              description: `Pages: ${warned.join(", ")}. Use "Refresh" under Connected Instagram Accounts to see Meta's reason.`,
              variant: "destructive",
            });
          }
          load();
        } else {
          toast({ title: "Connection failed", description: String(e.data.error), variant: "destructive" });
        }
      };
      window.addEventListener("message", onMessage);

      const timer = setInterval(() => {
        if (popup.closed) {
          clearInterval(timer);
          setConnecting(false);
          load();
        }
      }, 1000);
    } catch (err: any) {
      setConnecting(false);
      toast({ title: "Connection failed", description: err.message, variant: "destructive" });
    }
  };

  const saveConfig = async () => {
    if (!conn) return;
    setSaving(true);
    const { error } = await supabase
      .from("social_connections")
      .update({
        default_page_id: defaults.page || null,
        default_instagram_id: defaults.ig || null,
        default_ad_account_id: defaults.ad || null,
        default_ad_instagram_id: defaults.adIg || null,
        default_ad_instagram_username: adIgAccounts.find((a) => a.id === defaults.adIg)?.username || null,
      })
      .eq("id", conn.id);
    setSaving(false);
    if (error) toast({ title: "Could not save", description: error.message, variant: "destructive" });
    else toast({ title: "Configuration saved" });
  };

  const disconnect = async () => {
    if (!conn) return;
    // Disconnecting removes the stored tokens, so it goes through the (admin/manager only) function.
    const { data, error: invokeError } = await supabase.functions.invoke("meta-api", { body: { action: "disconnect" } });
    const error = invokeError ?? (data?.error && data?.code !== "meta_not_connected" ? new Error(data.error) : null);
    if (error) toast({ title: "Could not disconnect", description: error.message, variant: "destructive" });
    else {
      setConn(null);
      setDefaults({ page: "", ig: "", ad: "", adIg: "" });
      setAdIgAccounts([]);
      setAdIgError("");
      setIgSync(null);
      toast({ title: "Disconnected" });
      load();
    }
  };

  const syncInstagram = async () => {
    if (!conn) return;
    setIgSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-api", { body: { action: "sync_instagram_accounts" } });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      const res = data as IgSyncResult;
      setIgSync(res);
      const { data: p } = await supabase.from("social_pages").select(PAGE_COLUMNS).eq("connection_id", conn.id).order("page_name");
      setPages(p || []);
      const found = res.pages.filter((x) => x.instagram_id).length;
      toast({
        title: found ? `${found} Instagram account${found === 1 ? "" : "s"} found` : "No Instagram account linked yet",
        description: found ? undefined : "See the notes under Connected Instagram Accounts.",
      });
    } catch (err) {
      toast({ title: "Could not refresh Instagram accounts", description: (err as Error).message, variant: "destructive" });
    } finally {
      setIgSyncing(false);
    }
  };

  const igAccounts = pages.filter((p) => p.instagram_id);

  return (
    <div className="space-y-6">
      <BackButton />
      <div>
        <h1 className="text-2xl md:text-3xl font-semibold">Meta</h1>
        <p className="text-muted-foreground mt-1">
          Connect your Meta Business account to publish Facebook posts, Instagram posts and create Facebook Ads.
        </p>
      </div>

      <Card className="rounded-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Facebook className="h-5 w-5 text-primary" /> Meta Business Connection
          </CardTitle>
          <CardDescription>
            One secure sign-in links your Pages, Instagram accounts and Ad Accounts. No IDs or tokens to copy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !conn ? (
            <Button size="lg" onClick={connect} disabled={connecting} className="gap-2">
              {connecting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Facebook className="h-5 w-5" />}
              Connect with Facebook
            </Button>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                <CheckCircle2 className="h-5 w-5 text-primary" />
                <span className="font-medium">Connected Successfully</span>
                {conn.status === "needs_reauth" && <Badge variant="destructive">Re-authentication required</Badge>}
                <div className="ml-auto flex gap-2">
                  <Button variant="outline" size="sm" onClick={connect} className="gap-2">
                    <RefreshCw className="h-4 w-4" /> Re-sync
                  </Button>
                  <Button variant="ghost" size="sm" onClick={disconnect} className="gap-2 text-destructive">
                    <Unplug className="h-4 w-4" /> Disconnect
                  </Button>
                </div>
              </div>

              {conn.created_at && new Date(conn.created_at).getTime() < PERMISSIONS_UPDATED_AT && (
                <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 flex flex-wrap items-center gap-2">
                  <span>This connection was made before the lead-ads permissions (pages_manage_ads, leads_retrieval) were added on 30 Sep 2026. Lead forms and lead ad sets need them.</span>
                  <Button size="sm" variant="outline" onClick={connect} disabled={connecting} className="ml-auto gap-2">
                    {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Facebook className="h-4 w-4" />} Reconnect to grant them
                  </Button>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Facebook User</p>
                  <p className="font-medium">{conn.external_user_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase text-muted-foreground">Business Name</p>
                  <p className="font-medium">{conn.business_name || "—"}</p>
                </div>
              </div>

              <Separator />

              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2"><Facebook className="h-4 w-4" /> Connected Facebook Pages</p>
                  {pages.length === 0 && <p className="text-sm text-muted-foreground">No pages found.</p>}
                  {pages.map((p) => (
                    <div key={p.id} className="rounded-lg border p-2 text-sm">{p.page_name}</div>
                  ))}
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium flex items-center gap-2"><Instagram className="h-4 w-4" /> Connected Instagram Accounts</p>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={syncInstagram}
                      disabled={igSyncing}
                      title="Refresh Instagram accounts from Meta"
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      {igSyncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
                    </Button>
                  </div>
                  {igAccounts.length === 0 && <p className="text-sm text-muted-foreground">No Instagram business accounts linked.</p>}
                  {igAccounts.map((p) => (
                    <div key={p.id} className="rounded-lg border p-2 text-sm">@{p.instagram_username || p.instagram_id}</div>
                  ))}
                  {igSync && (
                    <div className="space-y-1 text-xs text-muted-foreground">
                      {igSync.missing_permissions.length > 0 && (
                        <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-amber-800">
                          Reconnect to grant: {igSync.missing_permissions.join(", ")}. Without instagram_basic, Meta does not reveal the Instagram account linked to a Page.
                        </p>
                      )}
                      {igSync.pages.map((p) => (
                        <p key={p.page_id}>
                          <span className="font-medium text-foreground">{p.page_name || p.page_id}:</span>{" "}
                          {p.instagram_id
                            ? `@${p.instagram_username || p.instagram_id}`
                            : p.error || "no Instagram professional account is connected to this Page"}
                        </p>
                      ))}
                      {igSync.errors.map((e) => <p key={e}>{e}</p>)}
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium flex items-center gap-2"><Megaphone className="h-4 w-4" /> Connected Ad Accounts</p>
                  {accounts.length === 0 && <p className="text-sm text-muted-foreground">No ad accounts found.</p>}
                  {accounts.map((a) => (
                    <div key={a.id} className="rounded-lg border p-2 text-sm">
                      {a.name} <span className="text-muted-foreground">({a.currency})</span>
                    </div>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default Facebook Page</label>
                  <Select value={defaults.page} onValueChange={(v) => setDefaults((d) => ({ ...d, page: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select page" /></SelectTrigger>
                    <SelectContent>
                      {pages.map((p) => <SelectItem key={p.page_id} value={p.page_id}>{p.page_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default Instagram account (organic posts)</label>
                  <Select value={defaults.ig} onValueChange={(v) => setDefaults((d) => ({ ...d, ig: v }))}>
                    <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                    <SelectContent>
                      {igAccounts.map((p) => (
                        <SelectItem key={p.instagram_id} value={p.instagram_id}>@{p.instagram_username || p.instagram_id}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Needs an Instagram professional account linked to the Page. A private account cannot post through the API, but can still be the ad identity.</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default Ad Account</label>
                  <Select value={defaults.ad} onValueChange={(v) => setDefaults((d) => ({ ...d, ad: v, adIg: "" }))}>
                    <SelectTrigger><SelectValue placeholder="Select ad account" /></SelectTrigger>
                    <SelectContent>
                      {accounts.map((a) => <SelectItem key={a.ad_account_id} value={a.ad_account_id}>{a.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Default Instagram profile for ads</label>
                  <Select
                    value={defaults.adIg || "__page__"}
                    onValueChange={(v) => setDefaults((d) => ({ ...d, adIg: v === "__page__" ? "" : v }))}
                    disabled={!defaults.ad || adIgLoading}
                  >
                    <SelectTrigger><SelectValue placeholder={adIgLoading ? "Loading from Meta…" : "Page default"} /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__page__">Page default (Page-backed Instagram account)</SelectItem>
                      {adIgAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>@{a.username || a.id}</SelectItem>
                      ))}
                      {defaults.adIg && !adIgAccounts.some((a) => a.id === defaults.adIg) && (
                        <SelectItem value={defaults.adIg}>@{conn.default_ad_instagram_username || defaults.adIg} (saved)</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {adIgError
                      ? adIgError
                      : !defaults.ad
                        ? "Choose a default ad account first."
                        : !adIgLoading && adIgAccounts.length === 0
                          ? "No Instagram profile is attached to this ad account on Meta (Business settings → Instagram profiles → Connect assets)."
                          : "Same list as Ads Manager → Identity → Instagram profile. Used by every ad unless the ad picks another."}
                  </p>
                </div>
              </div>

              <Button onClick={saveConfig} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />} Save Configuration
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}