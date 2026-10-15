import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { bareAdAccountId, loadMetaScope, type MetaAdAccount } from "@/lib/metaScope";
import { AdAccountSelect } from "@/components/communications/meta/AdAccountSelect";
import { useAdAccountFilter } from "@/hooks/useAdAccountFilter";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { BackButton } from "@/components/shared/BackButton";
import { CampaignPerformanceDialog } from "@/components/communications/meta/CampaignPerformanceDialog";
import { Archive, BarChart3, Copy, Download, Loader2, MoreHorizontal, Pause, Play, Plus, Rocket, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { formatIst, isoToIst, istToIso } from "@/lib/istTime";

// "conversions" is the same Meta value as "sales" (OUTCOME_SALES); kept only for existing rows.
const OBJECTIVES = [
  ["awareness", "Awareness"], ["traffic", "Traffic"], ["engagement", "Engagement"],
  ["leads", "Leads"], ["sales", "Sales"], ["app_promotion", "App Promotion"],
];
const OBJECTIVE_LABEL: Record<string, string> = Object.fromEntries([...OBJECTIVES, ["conversions", "Sales (conversions)"]]);
// All seven Meta special ad categories.
const SPECIAL_CATEGORIES: Array<[string, string]> = [
  ["housing", "Housing"], ["employment", "Employment"], ["credit", "Credit"],
  ["issues_elections_politics", "Issues, elections or politics"],
  ["online_gambling_and_gaming", "Online gambling and gaming"],
  ["financial_products_services", "Financial products and services"],
];
// Campaign-level bid strategies (used only when the campaign carries the budget).
const BID_STRATEGIES: Array<[string, string]> = [
  ["LOWEST_COST_WITHOUT_CAP", "Lowest cost (no cap)"],
  ["LOWEST_COST_WITH_BID_CAP", "Bid cap"],
  ["COST_CAP", "Cost cap"],
  ["LOWEST_COST_WITH_MIN_ROAS", "Minimum ROAS"],
];
const COUNTRY_CHOICES: Array<[string, string]> = [["IN", "India"], ["AE", "United Arab Emirates"], ["US", "United States"], ["GB", "United Kingdom"], ["SG", "Singapore"], ["AU", "Australia"], ["CA", "Canada"]];

const emptyForm = {
  name: "", objective: "awareness", buying_type: "auction", budget_type: "daily",
  budget_amount: "", status: "draft", specials: [] as string[], countries: ["IN"] as string[],
  bid_strategy: "LOWEST_COST_WITHOUT_CAP", spend_cap: "",
  // All dates/times are IST (Asia/Kolkata); stored as UTC instants.
  start_date: "", start_time: "00:00", end_date: "", end_time: "23:59",
};

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export default function MetaCampaigns() {
  const [loading, setLoading] = useState(true);
  const [metaConnected, setMetaConnected] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  // "Choose Ad Account" filter: a pure view over `rows`.
  const [accountFilter, applyAccountFilter] = useAdAccountFilter();
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteFailed, setDeleteFailed] = useState<{ id: string; message: string } | null>(null);
  const [perfId, setPerfId] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const editingPublished = editId ? rows.find((r) => r.id === editId)?.external_id : null;

  const load = async () => {
    setLoading(true);
    const scope = await loadMetaScope();
    setMetaConnected(scope.connected);
    setRows(scope.campaigns);
    setAdAccounts(scope.adAccounts);
    setLoading(false);
    return scope;
  };

  const visibleRows = useMemo(
    () => (accountFilter === "all" ? rows : rows.filter((r) => bareAdAccountId(r.ad_account_id) === accountFilter)),
    [rows, accountFilter],
  );

  const runImport = async (silent = false) => {
    setImporting(true);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "import_from_meta", payload: {} },
    });
    setImporting(false);
    if (error || data?.error) {
      if (!silent) {
        toast({
          title: "Could not import from Meta",
          description: data?.error || error?.message,
          variant: "destructive",
        });
      }
      return;
    }
    if (!silent) {
      toast({
        title: "Imported from Meta",
        description: `${data.campaigns} campaigns, ${data.ad_sets} ad sets, ${data.ads} ads`,
      });
    }
    load();
  };

  useEffect(() => {
    (async () => {
      const scope = await load();
      // First visit for a connected account with nothing stored: pull it in.
      const key = `meta-auto-import-${scope.connectionId}`;
      if (scope.connected && scope.campaigns.length === 0 && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        runImport(true);
      }
    })();
  }, []);


  const openNew = () => { setEditId(null); setForm({ ...emptyForm }); setOpen(true); };
  const openEdit = (r: any) => {
    setEditId(r.id);
    const start = isoToIst(r.start_date);
    const end = isoToIst(r.end_date);
    setForm({
      name: r.name, objective: r.objective, buying_type: r.buying_type, budget_type: r.budget_type,
      budget_amount: Number(r.budget_amount) > 0 ? String(r.budget_amount) : "", status: r.status,
      specials: Array.isArray(r.special_ad_categories) ? r.special_ad_categories : [],
      countries: Array.isArray(r.special_ad_category_country) && r.special_ad_category_country.length ? r.special_ad_category_country : ["IN"],
      bid_strategy: r.bid_strategy || "LOWEST_COST_WITHOUT_CAP",
      spend_cap: Number(r.spend_cap) > 0 ? String(r.spend_cap) : "",
      start_date: start?.date || "", start_time: start?.time || "00:00",
      end_date: end?.date || "", end_time: end?.time || "23:59",
    });
    setOpen(true);
  };

  const hasCampaignBudget = form.budget_amount.trim() !== "" && Number(form.budget_amount) > 0;
  const startIso = form.start_date ? istToIso(form.start_date, form.start_time) : null;
  const endIso = form.end_date ? istToIso(form.end_date, form.end_time) : null;
  const formProblems: string[] = [];
  if (hasCampaignBudget && form.budget_type === "lifetime" && !endIso) formProblems.push("A lifetime budget needs an End Date (Meta rule).");
  if (startIso && endIso && new Date(endIso) <= new Date(startIso)) formProblems.push("End must be after Start.");
  if (form.spend_cap.trim() !== "" && !(Number(form.spend_cap) > 0)) formProblems.push("Spend cap must be above zero, or blank.");

  const save = async () => {
    if (!form.name.trim()) { toast({ title: "Campaign name is required", variant: "destructive" }); return; }
    if (form.budget_amount.trim() !== "" && !(Number(form.budget_amount) > 0)) {
      toast({ title: "Enter a budget above zero, or leave it blank to set budgets on the Ad Sets", variant: "destructive" });
      return;
    }
    if (formProblems.length) { toast({ title: "Please fix the campaign", description: formProblems[0], variant: "destructive" }); return; }
    setSaving(true);
    const { data: conn } = await supabase.from("social_connections").select("id,default_ad_account_id").eq("platform", "meta").maybeSingle();
    const payload = {
      platform: "meta",
      connection_id: conn?.id ?? null,
      ad_account_id: conn?.default_ad_account_id ?? null,
      name: form.name.trim(),
      objective: form.objective,
      buying_type: form.buying_type,
      budget_type: form.budget_type,
      budget_amount: Number(form.budget_amount || 0),
      status: form.status,
      special_ad_categories: form.specials,
      special_ad_category_country: form.specials.length ? form.countries : null,
      bid_strategy: hasCampaignBudget ? form.bid_strategy : null,
      spend_cap: form.spend_cap.trim() !== "" ? Number(form.spend_cap) : null,
      // IST wall-clock → UTC instant (Meta stores instants; the ad account shows them in its own zone).
      start_date: startIso,
      end_date: endIso,
    };
    const { error } = editId
      ? await supabase.from("social_campaigns").update(payload).eq("id", editId)
      : await supabase.from("social_campaigns").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    toast({ title: editId ? "Campaign updated" : "Campaign created" });
    setOpen(false);
    load();
  };

  const callApi = async (action: string, campaign_id: string, okMsg: string, extra: Record<string, unknown> = {}) => {
    setBusyId(campaign_id);
    const { data, error } = await supabase.functions.invoke("meta-api", { body: { action, payload: { campaign_id, ...extra } } });
    setBusyId(null);
    if (error || data?.error) {
      if (action === "delete_campaign" && data?.code === "meta_delete_failed") {
        setDeleteFailed({ id: campaign_id, message: String(data.error) });
        return;
      }
      toast({ title: "Action failed", description: data?.error || error?.message, variant: "destructive" });
      return;
    }
    toast({ title: okMsg, description: data?.campaign_id ? `Campaign ID: ${data.campaign_id}` : undefined });
    load();
  };

  const duplicate = async (r: any) => {
    const { id, external_id, published_at, created_at, updated_at, last_synced_at, ...rest } = r;
    const { error } = await supabase.from("social_campaigns").insert({ ...rest, name: `${r.name} (copy)`, status: "draft" });
    if (error) toast({ title: "Could not duplicate", description: error.message, variant: "destructive" });
    else { toast({ title: "Campaign duplicated" }); load(); }
  };

  const statusColor = (s: string) =>
    s === "active" ? "default" : s === "paused" ? "secondary" : s === "archived" || s === "deleted" ? "destructive" : "outline";
  const metaIssue = (r: { meta_effective_status?: string | null }): { label: string; title: string } | null => {
    const v = String(r.meta_effective_status || "").toUpperCase();
    if (v === "WITH_ISSUES") return { label: "Issues on Meta", title: "Meta reports issues with this campaign. Open Ads Manager to see the details." };
    if (v === "IN_PROCESS") return { label: "Processing", title: "Meta is still processing the last change." };
    return null;
  };

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Campaigns</h1>
          <p className="text-muted-foreground mt-1">Plan campaigns as drafts and publish them to Meta when ready.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => runImport()} disabled={importing} className="gap-2">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Import from Meta
          </Button>
          <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Create Campaign</Button>
        </div>
      </div>

      {metaConnected && !loading && (
        <div className="flex flex-wrap items-center gap-3">
          <AdAccountSelect accounts={adAccounts} value={accountFilter} onChange={applyAccountFilter} />
          <span className="text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length}</span>
          {accountFilter !== "all" && <Button variant="ghost" size="sm" onClick={() => applyAccountFilter("all")}>Clear</Button>}
        </div>
      )}

      <Card className="rounded-xl">
        <CardHeader><CardTitle>All Campaigns</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !metaConnected ? (
            <p className="py-10 text-center text-muted-foreground">Connect your Meta account in Communication Center &gt; Meta to view campaigns</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No campaigns yet. Create your first campaign.</p>
          ) : visibleRows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No campaigns in the chosen ad account.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Objective</TableHead>
                    <TableHead>Buying Type</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Schedule (IST)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Meta ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                      <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                      <TableCell>{OBJECTIVE_LABEL[r.objective] || String(r.objective || "").replace(/_/g, " ")}</TableCell>
                      <TableCell className="capitalize">{r.buying_type.replace(/_/g, " ")}{r.buying_type === "reach_and_frequency" && <span className="ml-1 text-[10px] text-muted-foreground">(not supported)</span>}</TableCell>
                      <TableCell className="whitespace-nowrap">{Number(r.budget_amount) > 0 ? <>{inr(Number(r.budget_amount))} <span className="text-muted-foreground">/ {r.budget_type}</span></> : <span className="text-muted-foreground">Ad set budgets</span>}</TableCell>
                      <TableCell className="whitespace-nowrap text-xs">{r.start_date || r.end_date ? <>{formatIst(r.start_date)}<br /><span className="text-muted-foreground">→ {formatIst(r.end_date)}</span></> : "—"}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant={statusColor(r.status) as any} className="capitalize">{r.status}</Badge>
                          {metaIssue(r) && <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-800" title={metaIssue(r)!.title}>{metaIssue(r)!.label}</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.external_id || "—"}</TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={busyId === r.id}>
                              {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => openEdit(r)}>Edit</DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setPerfId(r.id)} className="gap-2">
                              <BarChart3 className="h-4 w-4" /> View Campaign Performance
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => duplicate(r)} className="gap-2"><Copy className="h-4 w-4" /> Duplicate</DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => callApi("publish_campaign", r.id, r.external_id ? "Campaign republished" : "Campaign published")}
                              className="gap-2"
                            >
                              <Rocket className="h-4 w-4" /> {r.external_id ? "Republish Changes" : "Publish"}
                            </DropdownMenuItem>
                            {r.external_id && r.status === "active" && (
                              <DropdownMenuItem onClick={() => callApi("pause_campaign", r.id, "Campaign paused")} className="gap-2">
                                <Pause className="h-4 w-4" /> Pause
                              </DropdownMenuItem>
                            )}
                            {r.external_id && r.status !== "active" && (
                              <DropdownMenuItem onClick={() => callApi("resume_campaign", r.id, "Campaign resumed")} className="gap-2">
                                <Play className="h-4 w-4" /> Resume
                              </DropdownMenuItem>
                            )}
                            {r.external_id && r.status !== "archived" && (
                              <DropdownMenuItem onClick={() => callApi("archive_campaign", r.id, "Campaign archived")} className="gap-2">
                                <Archive className="h-4 w-4" /> Archive
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => setDeleteTarget(r)}
                              className="gap-2 text-destructive"
                            >
                              <Trash2 className="h-4 w-4" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{editId ? "Edit Campaign" : "Create Campaign"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Campaign Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-base" />
            </div>
            <div className="space-y-1.5">
              <Label>Campaign Objective</Label>
              <Select value={form.objective} onValueChange={(v) => setForm({ ...form, objective: v })} disabled={!!editingPublished}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OBJECTIVES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                  {form.objective === "conversions" && <SelectItem value="conversions">Sales (conversions)</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Buying Type</Label>
              <Select value={form.buying_type} onValueChange={(v) => setForm({ ...form, buying_type: v })} disabled={!!editingPublished}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auction">Auction</SelectItem>
                  <SelectItem value="reach_and_frequency" disabled={form.buying_type !== "reach_and_frequency"}>Reach &amp; Frequency (not supported yet)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Reach &amp; Frequency needs a Meta reservation this app does not create yet.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Budget Type</Label>
              <Select value={form.budget_type} onValueChange={(v) => setForm({ ...form, budget_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily Budget</SelectItem>
                  <SelectItem value="lifetime">Lifetime Budget</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Budget Amount (₹)</Label>
              <Input type="number" min="0" value={form.budget_amount}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })} className="text-base"
                placeholder="Leave blank to budget per Ad Set" />
              <p className="text-xs text-muted-foreground">
                {editingPublished ? "Objective and buying type cannot be changed on Meta after publishing. Budget, name, dates and category are updated in place." : "Blank means each Ad Set carries its own budget."}
              </p>
            </div>
            {hasCampaignBudget && (
              <div className="space-y-1.5">
                <Label>Bid Strategy (campaign budget)</Label>
                <Select value={form.bid_strategy} onValueChange={(v) => setForm({ ...form, bid_strategy: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{BID_STRATEGIES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">With a campaign budget, Meta applies the bid strategy at campaign level.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Spend Cap (₹, optional)</Label>
              <Input type="number" min="0" value={form.spend_cap} onChange={(e) => setForm({ ...form, spend_cap: e.target.value })} className="text-base" placeholder="No cap" />
              <p className="text-xs text-muted-foreground">Meta stops the campaign once this amount is spent (spend_cap).</p>
            </div>
            <div className="space-y-1.5">
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="paused">Paused</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Special Ad Categories</Label>
              <div className="grid gap-1.5 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-sm"><Checkbox checked={form.specials.length === 0} onCheckedChange={(c) => { if (c) setForm({ ...form, specials: [] }); }} />None</label>
                {SPECIAL_CATEGORIES.map(([v, l]) => (
                  <label key={v} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={form.specials.includes(v)} onCheckedChange={(c) => setForm({ ...form, specials: c ? [...form.specials, v] : form.specials.filter((x) => x !== v) })} />{l}
                  </label>
                ))}
              </div>
              {form.specials.length > 0 && (
                <div className="mt-1">
                  <Label className="text-xs text-muted-foreground">Countries where the special category applies</Label>
                  <div className="mt-1 flex flex-wrap gap-3">
                    {COUNTRY_CHOICES.map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 text-xs">
                        <Checkbox checked={form.countries.includes(v)} onCheckedChange={(c) => setForm({ ...form, countries: c ? [...form.countries, v] : form.countries.filter((x) => x !== v) })} />{l}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Start (IST)</Label>
              <div className="flex gap-2">
                <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="text-base" />
                <Input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-32 text-base" disabled={!form.start_date} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>End (IST){hasCampaignBudget && form.budget_type === "lifetime" ? " *" : ""}</Label>
              <div className="flex gap-2">
                <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="text-base" />
                <Input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-32 text-base" disabled={!form.end_date} />
              </div>
              <p className="text-xs text-muted-foreground">Times are India Standard Time (UTC+05:30) and are sent to Meta as exact instants.</p>
            </div>
            {formProblems.length > 0 && (
              <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
                {formProblems.map((p) => <div key={p}>• {p}</div>)}
              </div>
            )}
          </div>
          <DialogFooter className="sticky bottom-0 bg-background pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || formProblems.length > 0} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editId ? "Save Changes" : "Create Campaign"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the campaign "{deleteTarget?.name}" from your account and Meta Ads Manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction
            onClick={() => {
              if (deleteTarget) {
                callApi("delete_campaign", deleteTarget.id, "Campaign deleted");
                setDeleteTarget(null);
              }
            }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Yes, Delete
          </AlertDialogAction>
          <AlertDialogCancel>No, Keep It</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteFailed} onOpenChange={(open) => !open && setDeleteFailed(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Meta refused to delete the campaign</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFailed?.message} The campaign is still on Meta and still listed here. You can remove it from this app only; it stays in Ads Manager.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogAction
            onClick={() => { if (deleteFailed) { callApi("delete_campaign", deleteFailed.id, "Removed from this app", { local_only: true }); setDeleteFailed(null); } }}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete locally only
          </AlertDialogAction>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
        </AlertDialogContent>
      </AlertDialog>

      <CampaignPerformanceDialog campaignId={perfId} onOpenChange={(o) => !o && setPerfId(null)} />
    </div>
  );
}