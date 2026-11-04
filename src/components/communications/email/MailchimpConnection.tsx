import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, ExternalLink, KeyRound, Link2, Loader2, LogOut, Plus, RefreshCw, ShieldAlert, Trash2, Webhook, XCircle } from "lucide-react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  connectionHealthy,
  mailchimpApi,
  planLabel,
  type MailchimpConnection as Conn,
  type MailchimpDomain,
  type MailchimpList,
  type MailchimpStatus,
} from "@/lib/comms/mailchimp";

interface Props { onBack: () => void }

/**
 * Connections view of the Email Marketing tab.
 *
 * Configuration holds the clinic's own Mailchimp API key. The key is validated against
 * Mailchimp before it is stored, kept encrypted in comms_mailchimp_connection, and never
 * sent back here - once saved, all this screen ever sees is the last four characters and
 * the data centre. Settings covers sending domains, audiences, consent and the webhook.
 */
export function MailchimpConnection({ onBack }: Props) {
  const qc = useQueryClient();
  const [verifyEmail, setVerifyEmail] = useState("");
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [newList, setNewList] = useState({ name: "", from_name: "", from_email: "" });
  const [apiKey, setApiKey] = useState("");
  const [revealKey, setRevealKey] = useState(false);
  const [replacing, setReplacing] = useState(false);

  const status = useQuery({
    queryKey: ["mailchimp-status"],
    queryFn: async (): Promise<MailchimpStatus> => {
      try {
        return await mailchimpApi<MailchimpStatus>("status");
      } catch (e) {
        return { ok: false, error: (e as Error).message, connection: null };
      }
    },
  });
  const conn = status.data?.connection || null;
  const healthy = status.data?.ok === true && connectionHealthy(conn);
  const revoked = conn?.status === "revoked";
  const apiKeyAvailable = !!status.data?.api_key_available;
  const keySaved = apiKeyAvailable;

  const disconnect = useMutation({
    mutationFn: () => mailchimpApi("disconnect"),
    onSuccess: () => { toast({ title: "Mailchimp disconnected" }); refreshAll(); },
    onError: (e: Error) => toast({ title: "Could not disconnect", description: e.message, variant: "destructive" }),
  });

  const domains = useQuery({
    queryKey: ["mailchimp-domains"],
    enabled: healthy,
    queryFn: async () => (await mailchimpApi<{ domains: MailchimpDomain[] }>("domains")).domains,
  });
  const lists = useQuery({
    queryKey: ["mailchimp-lists"],
    enabled: healthy,
    queryFn: async () => mailchimpApi<{ lists: MailchimpList[]; constraints: { may_create?: boolean; max_instances?: number; current_total_instances?: number } | null; default_list_id: string | null }>("lists"),
  });

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ["mailchimp-status"] });
    qc.invalidateQueries({ queryKey: ["mailchimp-domains"] });
    qc.invalidateQueries({ queryKey: ["mailchimp-lists"] });
  }
  const onErr = (title: string) => (e: Error) => toast({ title, description: e.message, variant: "destructive" });

  const saveKey = useMutation({
    mutationFn: () => mailchimpApi<{ switched?: boolean }>("save_api_key", { api_key: apiKey.trim() }),
    onSuccess: (r) => {
      // Drop the typed key as soon as it is stored, so it does not sit in component state.
      setApiKey("");
      setRevealKey(false);
      setReplacing(false);
      toast({
        title: "Mailchimp connected",
        description: r?.switched ? "A different Mailchimp account - audience, webhook and consent have been reset." : undefined,
      });
      refreshAll();
    },
    onError: onErr("Could not save the API key"),
  });

  const clearKey = useMutation({
    mutationFn: () => mailchimpApi("clear_api_key"),
    onSuccess: () => { setApiKey(""); setRevealKey(false); setReplacing(false); toast({ title: "API key removed" }); refreshAll(); },
    onError: onErr("Could not remove the API key"),
  });

  const addDomain = useMutation({
    mutationFn: () => mailchimpApi("domain_add", { verification_email: verifyEmail }),
    onSuccess: () => { toast({ title: "Verification e-mail sent", description: `Mailchimp e-mailed a code to ${verifyEmail}. Enter it below.` }); setVerifyEmail(""); qc.invalidateQueries({ queryKey: ["mailchimp-domains"] }); },
    onError: onErr("Could not add domain"),
  });
  const verifyDomain = useMutation({
    mutationFn: (domain: string) => mailchimpApi("domain_verify", { domain, code: codes[domain] || "" }),
    onSuccess: (_d, domain) => { toast({ title: `${domain} verified` }); setCodes((c) => ({ ...c, [domain]: "" })); qc.invalidateQueries({ queryKey: ["mailchimp-domains"] }); },
    onError: onErr("Verification failed"),
  });
  const setDefault = useMutation({
    mutationFn: (list_id: string) => mailchimpApi("set_default_list", { list_id }),
    onSuccess: () => { toast({ title: "Default audience updated" }); refreshAll(); },
    onError: onErr("Could not set default audience"),
  });
  const createList = useMutation({
    mutationFn: () => mailchimpApi("list_create", newList),
    onSuccess: () => { toast({ title: "Audience created", description: "It is now the default audience for Mailchimp campaigns." }); setCreateOpen(false); refreshAll(); },
    onError: onErr("Could not create audience"),
  });
  const confirmConsent = useMutation({
    mutationFn: () => mailchimpApi("confirm_consent"),
    onSuccess: () => { toast({ title: "Consent recorded" }); qc.invalidateQueries({ queryKey: ["mailchimp-status"] }); },
    onError: onErr("Could not record consent"),
  });
  const ensureWebhook = useMutation({
    mutationFn: () => mailchimpApi<{ existing?: boolean }>("ensure_webhook"),
    onSuccess: (d) => { toast({ title: d.existing ? "Webhook already active" : "Webhook enabled", description: "Unsubscribes and cleaned addresses now flow back into suppressions." }); qc.invalidateQueries({ queryKey: ["mailchimp-status"] }); },
    onError: onErr("Could not enable webhook"),
  });

  const verifiedDomains = (domains.data || []).filter((d) => d.verified);
  const adminBase = conn?.dc ? `https://${conn.dc}.admin.mailchimp.com` : "https://admin.mailchimp.com";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-1" />Back to campaigns</Button>
          <h2 className="text-xl font-semibold mt-2">Connections</h2>
          <p className="text-sm text-muted-foreground">Mailchimp account used by Email Marketing. Your API key is stored encrypted and is never shown again once saved.</p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={status.isFetching}>
          {status.isFetching ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}Recheck
        </Button>
      </div>

      <Tabs defaultValue={keySaved ? "settings" : "configuration"} className="space-y-6">
        <TabsList>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="configuration" className="space-y-6 mt-0">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <KeyRound className="h-4 w-4" />Mailchimp API key
              </CardTitle>
              <CardDescription>
                In Mailchimp: <span className="font-medium">Account &amp; billing &rarr; Extras &rarr; API keys</span>. A key looks
                like <code className="text-xs">xxxxxxxxxxxxxxxx-us21</code>. It is checked against Mailchimp before it is saved,
                then stored encrypted &mdash; we never show it again.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {keySaved && !replacing ? (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Saved key</Label>
                    <div className="font-mono text-sm mt-1">
                      {"\u2022".repeat(16)}{conn?.api_key_last4 ?? ""}{conn?.dc ? `-${conn.dc}` : ""}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={() => { setReplacing(true); setApiKey(""); setRevealKey(false); }}>
                      Replace key
                    </Button>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      disabled={clearKey.isPending}
                      onClick={() => { if (confirm("Remove the saved Mailchimp API key? Email Marketing will stop working until a new key is saved.")) clearKey.mutate(); }}
                    >
                      {clearKey.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
                      Remove key
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="mc-api-key">Enter your Mailchimp API Key</Label>
                    <div className="flex gap-2 mt-1.5">
                      <div className="relative flex-1">
                        <Input
                          id="mc-api-key"
                          type={revealKey ? "text" : "password"}
                          value={apiKey}
                          onChange={(e) => setApiKey(e.target.value)}
                          placeholder={"\u2022".repeat(20)}
                          autoComplete="off"
                          spellCheck={false}
                          className="pr-10 font-mono"
                        />
                        <button
                          type="button"
                          onClick={() => setRevealKey((v) => !v)}
                          aria-label={revealKey ? "Hide API key" : "Show API key"}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
                        >
                          {revealKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      <Button onClick={() => saveKey.mutate()} disabled={!apiKey.trim() || saveKey.isPending}>
                        {saveKey.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Save
                      </Button>
                      {replacing && (
                        <Button variant="ghost" onClick={() => { setReplacing(false); setApiKey(""); setRevealKey(false); }}>Cancel</Button>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Only an admin or manager can save this. A key that Mailchimp rejects is not stored.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-6 mt-0">
      {/* Account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2 flex-wrap">
            Mailchimp account
            {status.isLoading ? null : healthy
              ? <Badge className="bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Connected</Badge>
              : <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Not connected</Badge>}
            {!status.isLoading && healthy && <Badge variant="outline">API key</Badge>}
          </CardTitle>
          <CardDescription>
            The account is whichever one your saved API key belongs to. Save a different key in Configuration to switch accounts.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {healthy && (
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" onClick={() => { if (confirm("Forget the saved audience, webhook and consent confirmation? The API key stays in place.")) disconnect.mutate(); }} disabled={disconnect.isPending}>
                <LogOut className="h-4 w-4 mr-2" />Reset saved settings
              </Button>
            </div>
          )}
          {status.isLoading ? (
            <Skeleton className="h-16 w-full" />
          ) : !healthy ? (
            <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <ShieldAlert className="h-5 w-5 text-destructive mt-0.5" />
              <div>
                <div className="font-medium">Mailchimp is not connected</div>
                <div className="text-muted-foreground">{status.data?.error || conn?.last_error || "Unknown error"}</div>
                <div className="text-muted-foreground mt-1">
                  {apiKeyAvailable
                    ? "The saved API key stopped working - it may have been deleted or rotated in Mailchimp. Save a new one in Configuration."
                    : "No API key saved yet. Open the Configuration tab and enter your Mailchimp API key."}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div><div className="text-xs text-muted-foreground">Account</div><div className="font-medium">{conn?.account_name || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Login e-mail</div><div>{conn?.login_email || "—"}</div></div>
              <div><div className="text-xs text-muted-foreground">Plan</div><div>{planLabel(conn?.pricing_plan_type)}</div></div>
              <div><div className="text-xs text-muted-foreground">Data centre</div><div>{conn?.dc || "—"} · {conn?.total_subscribers?.toLocaleString() ?? "—"} contacts</div></div>
              <div className="sm:col-span-2 lg:col-span-4 text-xs text-muted-foreground">
                Last checked {conn?.last_ping_at ? format(new Date(conn.last_ping_at), "MMM d, HH:mm") : "—"}.
                {conn?.pricing_plan_type === "forever_free" && " Free plan: one audience, 500 contacts and no scheduled sends (send now only)."}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {healthy && (
        <>
          {/* Sending domains */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Sending domains</CardTitle>
              <CardDescription>
                Campaigns can only be sent from an address on a verified domain. Authentication (DKIM / SPF) is set up in Mailchimp itself and stops the From address being rewritten.
                <a className="inline-flex items-center gap-1 ml-2 underline" href={`${adminBase}/account/domains/`} target="_blank" rel="noreferrer">Open in Mailchimp <ExternalLink className="h-3 w-3" /></a>
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {domains.isLoading ? <Skeleton className="h-12 w-full" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Domain</TableHead><TableHead>Verified</TableHead><TableHead>Authenticated</TableHead><TableHead className="w-[320px]" /></TableRow></TableHeader>
                  <TableBody>
                    {(domains.data || []).map((d) => (
                      <TableRow key={d.domain}>
                        <TableCell className="font-medium">{d.domain}</TableCell>
                        <TableCell>{d.verified ? <Badge className="bg-emerald-600 hover:bg-emerald-600">Verified</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
                        <TableCell>{d.authenticated ? <Badge variant="secondary">Yes</Badge> : <span className="text-xs text-muted-foreground">No</span>}</TableCell>
                        <TableCell>
                          {!d.verified && (
                            <div className="flex items-center gap-2">
                              <Input className="h-8" placeholder="Code from e-mail" value={codes[d.domain] || ""} onChange={(e) => setCodes((c) => ({ ...c, [d.domain]: e.target.value }))} />
                              <Button size="sm" variant="outline" onClick={() => verifyDomain.mutate(d.domain)} disabled={!codes[d.domain] || verifyDomain.isPending}>Verify</Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                    {(domains.data || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">No domains yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
              <div className="flex flex-wrap items-end gap-2">
                <div className="space-y-1.5">
                  <Label>Add a domain</Label>
                  <Input className="w-72" type="email" placeholder="you@yourdomain.com" value={verifyEmail} onChange={(e) => setVerifyEmail(e.target.value)} />
                </div>
                <Button size="sm" onClick={() => addDomain.mutate()} disabled={!verifyEmail || addDomain.isPending}>
                  {addDomain.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}Send verification code
                </Button>
                <p className="w-full text-xs text-muted-foreground">Mailchimp e-mails a code to that address; paste it in the row above to finish.</p>
              </div>
            </CardContent>
          </Card>

          {/* Audiences */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Audiences</CardTitle>
              <CardDescription>
                Contacts must belong to a Mailchimp audience before a campaign can reach them. The default audience receives every campaign's contacts; each campaign targets its own segment inside it, so contacts are never duplicated.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {lists.isLoading ? <Skeleton className="h-12 w-full" /> : (
                <Table>
                  <TableHeader><TableRow><TableHead>Audience</TableHead><TableHead className="text-right">Contacts</TableHead><TableHead>Created</TableHead><TableHead /></TableRow></TableHeader>
                  <TableBody>
                    {(lists.data?.lists || []).map((l) => {
                      const isDefault = l.id === conn?.default_list_id;
                      return (
                        <TableRow key={l.id}>
                          <TableCell className="font-medium">{l.name} {isDefault && <Badge className="ml-2">Default</Badge>}</TableCell>
                          <TableCell className="text-right">{l.stats?.member_count?.toLocaleString() ?? "—"}</TableCell>
                          <TableCell className="text-xs">{l.date_created ? format(new Date(l.date_created), "MMM d, yyyy") : "—"}</TableCell>
                          <TableCell className="text-right">
                            {!isDefault && <Button size="sm" variant="outline" onClick={() => setDefault.mutate(l.id)} disabled={setDefault.isPending}>Use as default</Button>}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {(lists.data?.lists || []).length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-4">No audiences in this account yet</TableCell></TableRow>}
                  </TableBody>
                </Table>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} disabled={lists.data?.constraints?.may_create === false}>
                  <Plus className="h-4 w-4 mr-2" />Create audience from clinic details
                </Button>
                {lists.data?.constraints?.may_create === false && (
                  <span className="text-xs text-muted-foreground">Your plan allows {lists.data.constraints.max_instances} audience{lists.data.constraints.max_instances === 1 ? "" : "s"}; pick one above.</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Consent + webhook */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Compliance</CardTitle>
              <CardDescription>Mailchimp suspends accounts that mail people who did not agree to it. Confirm once before the first send; unsubscribes are honoured on every future campaign.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <Checkbox
                  checked={!!conn?.consent_confirmed_at}
                  disabled={!!conn?.consent_confirmed_at || confirmConsent.isPending}
                  onCheckedChange={(v) => { if (v) confirmConsent.mutate(); }}
                />
                <span>
                  The patients in your saved views must have agreed to receive marketing e-mail from the clinic.
                  {conn?.consent_confirmed_at && <span className="block text-xs text-muted-foreground">Confirmed {format(new Date(conn.consent_confirmed_at), "MMM d, yyyy HH:mm")}</span>}
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
                <Webhook className="h-4 w-4 text-muted-foreground" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">Unsubscribe webhook {conn?.webhook_id ? <Badge variant="secondary" className="ml-1">Active</Badge> : <Badge variant="outline" className="ml-1">Not enabled</Badge>}</div>
                  <div className="text-xs text-muted-foreground">Mailchimp notifies the app when someone unsubscribes or an address is cleaned, and when a campaign finishes sending.</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => ensureWebhook.mutate()} disabled={!conn?.default_list_id || ensureWebhook.isPending}>
                  {ensureWebhook.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}{conn?.webhook_id ? "Re-check" : "Enable"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a Mailchimp audience</DialogTitle>
            <DialogDescription>Uses the clinic name and address from Settings for the footer Mailchimp requires.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Audience name</Label><Input value={newList.name} onChange={(e) => setNewList({ ...newList, name: e.target.value })} placeholder="e.g. Patients" /></div>
            <div className="space-y-1.5"><Label>Default from name</Label><Input value={newList.from_name} onChange={(e) => setNewList({ ...newList, from_name: e.target.value })} placeholder="The Skin Clinic" /></div>
            <div className="space-y-1.5">
              <Label>Default from e-mail (on a verified domain)</Label>
              <Input type="email" value={newList.from_email} onChange={(e) => setNewList({ ...newList, from_email: e.target.value })} placeholder={verifiedDomains[0] ? `hello@${verifiedDomains[0].domain}` : "hello@yourdomain.com"} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => createList.mutate()} disabled={createList.isPending || !newList.from_email}>
              {createList.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default MailchimpConnection;
