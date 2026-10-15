import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
import { BackButton } from "@/components/shared/BackButton";
import { Download, Loader2, MoreHorizontal, Pause, Play, Plus, RefreshCw, Rocket, Trash2, Users } from "lucide-react";
import { bareAdAccountId, loadMetaScope, type MetaAdAccount } from "@/lib/metaScope";
import { AdAccountSelect } from "@/components/communications/meta/AdAccountSelect";
import { useAdAccountFilter } from "@/hooks/useAdAccountFilter";
import { readMetaApiError } from "@/lib/metaErrors";
import { CustomerListAudienceDialog, type CreatedAudience } from "@/components/communications/meta/CustomerListAudienceDialog";
import { LocationPicker } from "@/components/communications/meta/LocationPicker";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AGE_OPTIONS,
  EMPTY_GEO,
  PLACEMENT_OPTIONS,
  ageBounds,
  describeGeo,
  describePlacements,
  geoIsEmpty,
  normalizePlacements,
  readGeo,
  serializePlacements,
  type GeoSelection,
} from "@/lib/metaTargeting";
import type { Database } from "@/integrations/supabase/types";

type CustomAudienceRow = Database["public"]["Tables"]["social_custom_audiences"]["Row"] & {
  meta_status?: { approximate_count_lower_bound?: number | null; delivery_status?: { description?: string } | null } | null;
};


const OPTIMIZATION_GOALS = [
  ["IMPRESSIONS", "Impressions"],
  ["REACH", "Reach"],
  ["LINK_CLICKS", "Link Clicks"],
  ["POST_ENGAGEMENT", "Post Engagement"],
  ["VIDEO_VIEWS", "Video Views"],
  ["CONVERSIONS", "Conversions"],
  ["LEAD_GENERATION", "Leads (instant form)"],
  ["QUALITY_LEAD", "Quality leads (instant form)"],
  ["APP_INSTALLS", "App Installs"],
];

const BILLING_EVENTS = [
  ["IMPRESSIONS", "Impressions"],
  ["LINK_CLICKS", "Link Clicks"],
  ["POST_ENGAGEMENT", "Post Engagement"],
  ["VIDEO_VIEWS", "Video Views"],
  ["PURCHASE", "Purchase"],
];

const BID_STRATEGIES = [
  ["COST_CAP", "Cost Cap"],
  ["LOWEST_COST_WITH_BID_CAP", "Bid Cap"],
];

const AUDIENCE_TYPES = [
  ["broad", "Advantage+ audience (broad)"],
  ["custom", "Custom audience"],
];

const CUSTOM_AUDIENCE_SOURCES = [
  ["customer_list", "Customer list"],
];

const normalizeAct = (v: unknown) => {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("act_") ? raw : `act_${raw}`;
};

const emptyForm = {
  campaign_id: "",
  name: "",
  optimization_goal: "LINK_CLICKS",
  billing_event: "LINK_CLICKS",
  bid_strategy: "LOWEST_COST_WITH_BID_CAP",
  budget_type: "daily",
  budget_amount: "",
  bid_amount: "",
  start_date: "",
  end_date: "",
  age_min: "18",
  age_max: "65",
  genders: [] as string[],
  locations: "",
  geo: EMPTY_GEO as GeoSelection,
  geo_from_legacy: false,
  placement_mode: "automatic" as "automatic" | "manual",
  placements: [] as string[],
  placements_confirmed: true,
  audience_type: "broad",
  custom_audience_source: "customer_list",
  custom_audience_id: "",
  /** Facebook Page promoted by a lead ad set (Meta promoted_object.page_id). */
  page_id: "",
};

const inr = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n || 0);

export default function MetaAdSets() {
  const [loading, setLoading] = useState(true);
  const [metaConnected, setMetaConnected] = useState(true);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [audiences, setAudiences] = useState<CustomAudienceRow[]>([]);
  const [defaultAdAccountId, setDefaultAdAccountId] = useState<string>("");
  const [pages, setPages] = useState<Array<{ page_id: string; page_name: string }>>([]);
  const [defaultPageId, setDefaultPageId] = useState<string>("");
  const [audienceDialogOpen, setAudienceDialogOpen] = useState(false);
  const [refreshingAudience, setRefreshingAudience] = useState(false);
  // Campaign filter for the list (pure view over `rows`; deep-linkable via ?campaign=).
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaignFilter, setCampaignFilter] = useState<string>(searchParams.get("campaign") || "all");
  // "Choose Ad Account" filter: narrows campaigns (and therefore ad sets) to one ad account.
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [accountFilter, applyAccountFilter] = useAdAccountFilter();

  const load = async () => {
    setLoading(true);
    const scope = await loadMetaScope();
    setMetaConnected(scope.connected);
    setCampaigns(scope.campaigns);
    setAdAccounts(scope.adAccounts);
    if (!scope.connected) {
      setRows([]);
      setLoading(false);
      return;
    }
    const { data } = await supabase.from("social_ad_sets").select("*").order("created_at", { ascending: false });
    setRows((data || []).filter((r: any) => r.campaign_id && scope.campaignIds.has(r.campaign_id)));
    await Promise.all([loadAudiences(), loadDefaultAdAccount(scope.connectionId)]);
    setLoading(false);
  };

  const loadAudiences = async () => {
    const { data } = await supabase
      .from("social_custom_audiences")
      .select("*")
      .eq("platform", "meta")
      .order("created_at", { ascending: false });
    setAudiences((data || []) as CustomAudienceRow[]);
  };

  const loadDefaultAdAccount = async (connectionId: string | null) => {
    if (!connectionId) { setDefaultAdAccountId(""); return; }
    const { data } = await supabase
      .from("social_connections")
      .select("default_ad_account_id, default_page_id")
      .eq("id", connectionId)
      .maybeSingle();
    setDefaultAdAccountId(normalizeAct(data?.default_ad_account_id));
    setDefaultPageId(data?.default_page_id || "");
    const { data: pageRows } = await supabase.from("social_pages").select("page_id, page_name").eq("connection_id", connectionId).order("page_name");
    setPages((pageRows || []).map((p: { page_id: string; page_name: string | null }) => ({ page_id: p.page_id, page_name: p.page_name || p.page_id })));
  };


  useEffect(() => { load(); }, []);

  const openNew = () => {
    setEditId(null);
    // Convenience only: pre-select the campaign currently filtered (still editable).
    setForm({ ...emptyForm, campaign_id: campaignFilter !== "all" && campaigns.some((c) => c.id === campaignFilter) ? campaignFilter : "" });
    setOpen(true);
  };

  const applyCampaignFilter = (value: string) => {
    setCampaignFilter(value);
    const next = new URLSearchParams(searchParams);
    if (value === "all") next.delete("campaign"); else next.set("campaign", value);
    setSearchParams(next, { replace: true });
  };

  const campaignsInAccount = useMemo(
    () => (accountFilter === "all" ? campaigns : campaigns.filter((c) => bareAdAccountId(c.ad_account_id) === accountFilter)),
    [campaigns, accountFilter],
  );
  const campaignIdsInAccount = useMemo(() => new Set(campaignsInAccount.map((c) => c.id)), [campaignsInAccount]);
  const changeAccountFilter = (value: string) => {
    applyAccountFilter(value);
    // Drop a campaign filter that no longer belongs to the chosen account.
    if (campaignFilter !== "all" && value !== "all" && !campaigns.some((c) => c.id === campaignFilter && bareAdAccountId(c.ad_account_id) === value)) {
      applyCampaignFilter("all");
    }
  };
  const sortedCampaigns = useMemo(() => [...campaignsInAccount].sort((a, b) => String(a.name).localeCompare(String(b.name))), [campaignsInAccount]);
  const visibleRows = useMemo(
    () => rows.filter((r) => (accountFilter === "all" || campaignIdsInAccount.has(r.campaign_id)) && (campaignFilter === "all" || r.campaign_id === campaignFilter)),
    [rows, campaignFilter, accountFilter, campaignIdsInAccount],
  );

  const openEdit = (r: any) => {
    setEditId(r.id);
    const targeting = r.targeting || {};
    const campaign = campaigns.find((item) => item.id === r.campaign_id);
    const campaignHasBudget = Number(campaign?.budget_amount) > 0;
    setForm({
      campaign_id: r.campaign_id || "",
      name: r.name,
      // "LEADS" was never a Meta enum; show it as the documented LEAD_GENERATION.
      optimization_goal: r.optimization_goal === "LEADS" ? "LEAD_GENERATION" : (r.optimization_goal || "LINK_CLICKS"),
      billing_event: r.billing_event || "LINK_CLICKS",
      bid_strategy: r.bid_strategy === "LOWEST_COST" || r.bid_strategy === "LOWEST_COST_WITHOUT_CAP" || r.bid_strategy === "BID_CAP"
          ? "LOWEST_COST_WITH_BID_CAP"
          : r.bid_strategy || "LOWEST_COST_WITH_BID_CAP",
      budget_type: r.budget_type || "daily",
      budget_amount: campaignHasBudget ? "" : String(r.budget_amount ?? ""),
      bid_amount: String(r.bid_amount ?? ""),
      start_date: r.start_at ? String(r.start_at).slice(0, 10) : "",
      end_date: r.end_at ? String(r.end_at).slice(0, 10) : "",
      age_min: String(ageBounds(targeting.age_min, targeting.age_max).min),
      age_max: String(ageBounds(targeting.age_min, targeting.age_max).max),
      genders: Array.isArray(targeting.genders) ? targeting.genders.filter((g: string) => g === "Men" || g === "Women") : [],
      locations: targeting.locations || "",
      geo: readGeo(targeting).geo,
      geo_from_legacy: readGeo(targeting).fromLegacy,
      placement_mode: normalizePlacements(r.placements).mode,
      placements: normalizePlacements(r.placements).mode === "manual" ? (normalizePlacements(r.placements) as { codes: string[] }).codes : [],
      placements_confirmed: normalizePlacements(r.placements).confirmed,
      audience_type: r.custom_audience_id ? "custom" : "broad",
      custom_audience_source: "customer_list",
      custom_audience_id: r.custom_audience_id || "",
      page_id: r.page_id || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.campaign_id.trim()) {
      toast({ title: "Please select a campaign", variant: "destructive" });
      return;
    }
    if (!form.name.trim()) {
      toast({ title: "Ad Set name is required", variant: "destructive" });
      return;
    }
    if (form.placement_mode === "manual" && form.placements.length === 0) {
      toast({ title: "Please select at least one placement", description: "Or switch back to Advantage+ placements.", variant: "destructive" });
      return;
    }
    if (Number(form.age_min) > Number(form.age_max)) {
      toast({ title: "Minimum age cannot exceed maximum age", variant: "destructive" });
      return;
    }
    if (form.audience_type === "custom" && !form.custom_audience_id) {
      toast({ title: "Choose a customer list", description: "Pick an uploaded list or upload a new one for this custom audience.", variant: "destructive" });
      return;
    }

    // Check if campaign has budget
    const campaign = campaigns.find(c => c.id === form.campaign_id);
    const campaignHasBudget = Number(campaign?.budget_amount) > 0;

    // Budget is required on either campaign or ad set
    const budgetAmount = Number(form.budget_amount);
    if (!campaignHasBudget && (!Number.isFinite(budgetAmount) || budgetAmount <= 0)) {
      toast({ title: "Enter a valid budget amount", description: "Budget is required on either the campaign or the ad set.", variant: "destructive" });
      return;
    }

    const bidAmount = Number(form.bid_amount);
    if (!Number.isFinite(bidAmount) || bidAmount <= 0) {
      toast({ title: "Enter a valid bid amount", description: "Meta requires a positive bid amount for this ad account.", variant: "destructive" });
      return;
    }

    setSaving(true);
    const targeting = {
      age_min: form.age_min,
      age_max: form.age_max,
      genders: form.genders,
      // `locations` stays as a readable summary for lists and older code paths.
      locations: geoIsEmpty(form.geo) ? "" : describeGeo(form.geo),
      geo: form.geo,
    };

    const payload: any = {
      platform: "meta",
      campaign_id: form.campaign_id,
      name: form.name.trim(),
      optimization_goal: form.optimization_goal,
      billing_event: form.billing_event,
      bid_strategy: form.bid_strategy,
      budget_type: form.budget_type,
      budget_amount: campaignHasBudget ? null : budgetAmount,
      bid_amount: bidAmount,
      start_at: form.start_date ? new Date(form.start_date).toISOString() : null,
      end_at: form.end_date ? new Date(form.end_date).toISOString() : null,
      targeting,
      placements: serializePlacements(form.placement_mode, form.placements),
      custom_audience_id: form.audience_type === "custom" ? form.custom_audience_id : null,
      // Only lead ad sets carry a promoted Page; other ad sets are saved exactly as before.
      ...(campaigns.find((c) => c.id === form.campaign_id)?.objective === "leads" ? { page_id: form.page_id || defaultPageId || null } : {}),
    };

    // Editing settings must not turn an already-published Ad Set back into a
    // local draft. Meta status is controlled by Publish, Pause, and Resume.
    if (!editId) payload.status = "draft";

    const { error } = editId
      ? await supabase.from("social_ad_sets").update(payload).eq("id", editId)
      : await supabase.from("social_ad_sets").insert(payload);

    setSaving(false);
    if (error) {
      toast({ title: "Could not save", description: error.message, variant: "destructive" });
      return;
    }
    const wasPublished = !!rows.find((r) => r.id === editId)?.external_id;
    toast({
      title: editId ? "Ad Set updated" : "Ad Set created",
      description: wasPublished ? "Saved here. Click \"Update on Meta\" on this Ad Set to apply the changes on Meta." : undefined,
    });
    setOpen(false);
    load();
  };

  const callApi = async (action: string, adset_id: string, okMsg: string) => {
    if (action === "publish_adset") {
      const adSet = rows.find((row) => row.id === adset_id);
      if (adSet && (!Number.isFinite(Number(adSet.bid_amount)) || Number(adSet.bid_amount) <= 0)) {
        toast({
          title: "Bid amount required",
          description: "Edit this Ad Set and enter a bid amount before publishing.",
          variant: "destructive",
        });
        openEdit(adSet);
        return;
      }
    }
    setBusyId(adset_id);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action, payload: { adset_id } }
    });
    setBusyId(null);
    if (error || data?.error) {
      toast({ title: "Action failed", description: await readMetaApiError(error, data), variant: "destructive" });
      return;
    }
    toast({ title: okMsg });
    load();
  };

  const refreshAudience = async (audienceId: string) => {
    setRefreshingAudience(true);
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "refresh_custom_audience", payload: { audience_id: audienceId } },
    });
    setRefreshingAudience(false);
    if (error || data?.error) {
      toast({ title: "Could not refresh audience", description: await readMetaApiError(error, data), variant: "destructive" });
      return;
    }
    await loadAudiences();
    toast({ title: "Audience status refreshed" });
  };

  const onAudienceCreated = async (audience: CreatedAudience) => {
    await loadAudiences();
    setForm((f) => ({ ...f, audience_type: "custom", custom_audience_source: "customer_list", custom_audience_id: audience.id }));
  };

  const audienceLabel = (a: CustomAudienceRow) => {
    const size = a.meta_status?.approximate_count_lower_bound;
    const date = a.created_at ? new Date(a.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "";
    return `${a.name} · ${Number(a.row_count || 0).toLocaleString("en-IN")} rows${Number(size) > 0 ? ` · ~${Number(size).toLocaleString("en-IN")} matched` : ""}${date ? ` · ${date}` : ""}`;
  };

  const audienceName = (id: string | null) => audiences.find((a) => a.id === id)?.name;

  const getCampaignName = (campaignId: string) => {
    return campaigns.find(c => c.id === campaignId)?.name || campaignId;
  };

  const statusColor = (s: string) =>
    s === "active" ? "default" : s === "paused" ? "secondary" : "outline";

  const selectedCampaign = campaigns.find((campaign) => campaign.id === form.campaign_id);
  const selectedCampaignHasBudget = Number(selectedCampaign?.budget_amount) > 0;
  const selectedAdAccountId = normalizeAct(selectedCampaign?.ad_account_id) || defaultAdAccountId;
  const audiencesForAccount = audiences.filter(
    (a) => a.status === "ready" && (!selectedAdAccountId || normalizeAct(a.ad_account_id) === selectedAdAccountId),
  );
  const selectedAudience = audiences.find((a) => a.id === form.custom_audience_id);

  return (
    <div className="space-y-6">
      <BackButton />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold">Ad Sets</h1>
          <p className="text-muted-foreground mt-1">Create and manage ad sets with targeting and budget controls.</p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Create Ad Set</Button>
      </div>

      {metaConnected && !loading && (
        <AdAccountSelect accounts={adAccounts} value={accountFilter} onChange={changeAccountFilter} />
      )}

      <Card className="rounded-xl">
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>All Ad Sets</CardTitle>
            {metaConnected && !loading && (
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">Campaign</Label>
                <Select value={campaignFilter} onValueChange={applyCampaignFilter}>
                  <SelectTrigger className="h-9 w-[240px]"><SelectValue placeholder="All campaigns" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    <SelectItem value="all">All campaigns</SelectItem>
                    {sortedCampaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length}</span>
                {(campaignFilter !== "all" || accountFilter !== "all") && (
                  <Button variant="ghost" size="sm" onClick={() => { applyCampaignFilter("all"); applyAccountFilter("all"); }}>Clear</Button>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : !metaConnected ? (
            <p className="py-10 text-center text-muted-foreground">Connect your Meta account in Communication Center &gt; Meta to view ad sets</p>
          ) : rows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No ad sets yet. Create your first ad set.</p>
          ) : visibleRows.length === 0 ? (
            <p className="py-10 text-center text-muted-foreground">No ad sets in this campaign.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ad Set Name</TableHead>
                    <TableHead>Campaign</TableHead>
                    <TableHead>Optimization</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Meta ID</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibleRows.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => openEdit(r)}>
                      <TableCell className="font-medium whitespace-nowrap">
                        {r.name}
                        <div className="mt-1 text-xs font-normal text-muted-foreground">
                          {describePlacements(r.placements)}{r.targeting?.locations ? ` · ${r.targeting.locations}` : ""}
                        </div>
                        {r.custom_audience_id && (
                          <div className="mt-1 flex items-center gap-1 text-xs font-normal text-muted-foreground">
                            <Users className="h-3 w-3" /> Customer list · {audienceName(r.custom_audience_id) || "—"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">{getCampaignName(r.campaign_id)}</TableCell>
                      <TableCell className="capitalize">{r.optimization_goal.replace(/_/g, " ")}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {Number(r.budget_amount) > 0 ? (
                          <>{inr(Number(r.budget_amount))} <span className="text-muted-foreground">/ {r.budget_type}</span></>
                        ) : (
                          <span className="text-muted-foreground">Campaign budget</span>
                        )}
                      </TableCell>
                      <TableCell><Badge variant={statusColor(r.status) as any} className="capitalize">{r.status}</Badge></TableCell>
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
                            {!r.external_id && (
                              <DropdownMenuItem onClick={() => callApi("publish_adset", r.id, "Ad Set published")} className="gap-2">
                                <Rocket className="h-4 w-4" /> Publish
                              </DropdownMenuItem>
                            )}
                            {r.external_id && (
                              <DropdownMenuItem onClick={() => callApi("publish_adset", r.id, "Ad Set changes updated on Meta")} className="gap-2">
                                <Rocket className="h-4 w-4" /> Update on Meta
                              </DropdownMenuItem>
                            )}
                            {r.external_id && r.status === "active" && (
                              <DropdownMenuItem onClick={() => callApi("pause_adset", r.id, "Ad Set paused")} className="gap-2">
                                <Pause className="h-4 w-4" /> Pause
                              </DropdownMenuItem>
                            )}
                            {r.external_id && r.status !== "active" && (
                              <DropdownMenuItem onClick={() => callApi("resume_adset", r.id, "Ad Set resumed")} className="gap-2">
                                <Play className="h-4 w-4" /> Resume
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem
                              onClick={() => callApi("delete_adset", r.id, "Ad Set deleted")}
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
          <DialogHeader><DialogTitle>{editId ? "Edit Ad Set" : "Create Ad Set"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Campaign</Label>
              <Select
                value={form.campaign_id}
                onValueChange={(v) => {
                  const campaign = campaigns.find((item) => item.id === v);
                  // Lead campaigns: Meta requires LEAD_GENERATION / QUALITY_LEAD billed on impressions.
                  const isLead = campaign?.objective === "leads";
                  const leadGoal = form.optimization_goal === "QUALITY_LEAD" ? "QUALITY_LEAD" : "LEAD_GENERATION";
                  setForm({
                    ...form,
                    campaign_id: v,
                    budget_amount: Number(campaign?.budget_amount) > 0 ? "" : form.budget_amount,
                    ...(isLead ? { optimization_goal: leadGoal, billing_event: "IMPRESSIONS" } : {}),
                  });
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select campaign..." /></SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Ad Set Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="text-base" />
            </div>
            {campaigns.find((c) => c.id === form.campaign_id)?.objective === "leads" && (
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Facebook Page (promoted by this lead ad set)</Label>
                <Select value={form.page_id || defaultPageId} onValueChange={(v) => setForm({ ...form, page_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose the Page whose instant form the ad will use" /></SelectTrigger>
                  <SelectContent>
                    {pages.map((p) => <SelectItem key={p.page_id} value={p.page_id}>{p.page_name}{p.page_id === defaultPageId ? " (default)" : ""}</SelectItem>)}
                    {pages.length === 0 && <div className="px-2 py-1.5 text-xs text-muted-foreground">No Pages on this connection</div>}
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">Meta's promoted_object.page_id. This Page must have accepted the Lead Ads Terms, and its instant forms are the ones offered on the ad.</p>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Optimization Goal</Label>
              <Select value={form.optimization_goal} onValueChange={(v) => setForm({ ...form, optimization_goal: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPTIMIZATION_GOALS.map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {campaigns.find((c) => c.id === form.campaign_id)?.objective === "leads" && (
                <p className="text-[11px] text-muted-foreground mt-1">Lead campaign: Meta requires Leads (instant form) or Quality leads, billed on impressions, with the destination fixed to the instant form on the ad (destination ON_AD, promoted Page = the ad set's Page).</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Billing Event</Label>
              <Select value={form.billing_event} onValueChange={(v) => setForm({ ...form, billing_event: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BILLING_EVENTS.map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Bid Strategy</Label>
              <Select value={form.bid_strategy} onValueChange={(v) => setForm({ ...form, bid_strategy: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {BID_STRATEGIES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
              <Label>Budget Amount (₹){selectedCampaignHasBudget ? " — Set at campaign" : ""}</Label>
              <Input
                type="number"
                min="0"
                value={form.budget_amount}
                disabled={selectedCampaignHasBudget}
                placeholder={selectedCampaignHasBudget ? "Using campaign budget" : "Enter ad set budget"}
                onChange={(e) => setForm({ ...form, budget_amount: e.target.value })}
                className="text-base"
              />
              {selectedCampaignHasBudget && (
                <p className="text-xs text-muted-foreground">
                  This campaign already has a {inr(Number(selectedCampaign?.budget_amount))} budget, so Meta does not allow another budget here.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Bid Amount (₹) *</Label>
              <Input type="number" min="0.01" step="0.01" required value={form.bid_amount}
                onChange={(e) => setForm({ ...form, bid_amount: e.target.value })}
                placeholder={form.bid_strategy === "COST_CAP" ? "Target cost" : "Maximum bid per result"}
                className="text-base" />
              <p className="text-xs text-muted-foreground">
                {form.bid_strategy === "COST_CAP" ? "Average target cost per result" : "Maximum amount Meta may bid per result"}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>Start Date</Label>
              <Input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="text-base" />
            </div>
            <div className="space-y-1.5">
              <Label>End Date</Label>
              <Input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="text-base" />
            </div>

            <div className="space-y-2 sm:col-span-2 border-t pt-4">
              <h3 className="font-medium text-sm">Targeting</h3>
            </div>

            <div className="space-y-1.5">
              <Label>Audience</Label>
              <Select value={form.audience_type} onValueChange={(v) => setForm({ ...form, audience_type: v, custom_audience_id: v === "custom" ? form.custom_audience_id : "" })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {AUDIENCE_TYPES.map(([v, l]) => (
                    <SelectItem key={v} value={v}>{l}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {form.audience_type === "custom"
                  ? "Show ads only to people from a list you provide."
                  : "Meta shows ads to people most likely to respond."}
              </p>
            </div>

            {form.audience_type === "custom" && (
              <div className="space-y-1.5">
                <Label>Custom audience source</Label>
                <Select value={form.custom_audience_source} onValueChange={(v) => setForm({ ...form, custom_audience_source: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CUSTOM_AUDIENCE_SOURCES.map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Reach people who have already interacted with your business.</p>
              </div>
            )}

            {form.audience_type === "custom" && form.custom_audience_source === "customer_list" && (
              <div className="space-y-1.5 sm:col-span-2 rounded-md border p-3">
                <Label>Customer list *</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Select
                    value={form.custom_audience_id}
                    onValueChange={(v) => setForm({ ...form, custom_audience_id: v })}
                    disabled={!audiencesForAccount.length}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={audiencesForAccount.length ? "Select an uploaded list" : "No lists uploaded yet"} />
                    </SelectTrigger>
                    <SelectContent>
                      {audiencesForAccount.map((a) => (
                        <SelectItem key={a.id} value={a.id}>{audienceLabel(a)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    disabled={!form.campaign_id}
                    onClick={() => setAudienceDialogOpen(true)}
                  >
                    <Plus className="h-4 w-4" /> Upload new list
                  </Button>
                  {selectedAudience?.external_id && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      title="Refresh matched size from Meta"
                      disabled={refreshingAudience}
                      onClick={() => refreshAudience(selectedAudience.id)}
                    >
                      {refreshingAudience ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {!form.campaign_id
                    ? "Select a campaign first — the list is uploaded to that campaign's ad account."
                    : selectedAudience
                      ? `${selectedAudience.name}: ${Number(selectedAudience.row_count || 0).toLocaleString("en-IN")} rows uploaded${selectedAudience.meta_status?.delivery_status?.description ? ` · ${selectedAudience.meta_status.delivery_status.description}` : ""}`
                      : "Upload a spreadsheet of emails / phones or import an existing Patients or Leads saved view. Lists are reusable across ad sets."}
                </p>
                {/* Meta's own customer-list sample (downloaded from Ads Manager → Custom audience → Customer list).
                    Static files under public/samples; users edit and upload them via "Upload new list". */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Meta's sample customer list:</span>
                  <a href="/samples/meta_customer_list_sample.xlsx" download className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Download className="h-3 w-3" /> Excel (.xlsx)
                  </a>
                  <a href="/samples/meta_customer_list_sample.csv" download className="inline-flex items-center gap-1 text-primary hover:underline">
                    <Download className="h-3 w-3" /> CSV
                  </a>
                  <span>Keep the email / phone columns; other columns are ignored.</span>
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Minimum age</Label>
              <Select value={form.age_min} onValueChange={(v) => setForm({ ...form, age_min: v, age_max: Number(form.age_max) < Number(v) ? v : form.age_max })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {AGE_OPTIONS.map((a) => (
                    <SelectItem key={a} value={String(a)}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Maximum age</Label>
              <Select value={form.age_max} onValueChange={(v) => setForm({ ...form, age_max: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-64">
                  {AGE_OPTIONS.filter((a) => a >= Number(form.age_min)).map((a) => (
                    <SelectItem key={a} value={String(a)}>{a === 65 ? "65+" : a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Gender</Label>
              <div className="flex gap-4">
                {["All", "Men", "Women"].map((g) => (
                  <div key={g} className="flex items-center gap-2">
                    <Checkbox
                      id={g}
                      checked={form.genders.includes(g) || (g === "All" && form.genders.length === 0)}
                      onCheckedChange={(checked) => {
                        if (g === "All") {
                          setForm({ ...form, genders: checked ? [] : ["All"] });
                        } else {
                          const genders = form.genders.length === 0 ? [] : form.genders;
                          setForm({
                            ...form,
                            genders: checked ? [...genders, g] : genders.filter(x => x !== g)
                          });
                        }
                      }}
                    />
                    <Label htmlFor={g} className="text-sm">{g}</Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label>Locations</Label>
              <LocationPicker
                value={form.geo}
                onChange={(geo) => setForm((f) => ({ ...f, geo, geo_from_legacy: false }))}
                fromLegacy={form.geo_from_legacy}
                legacyText={form.locations}
              />
            </div>

            <div className="space-y-2 sm:col-span-2 border-t pt-4">
              <h3 className="font-medium text-sm">Placements</h3>
              <RadioGroup
                value={form.placement_mode}
                onValueChange={(v) => setForm({ ...form, placement_mode: v as "automatic" | "manual", placements_confirmed: true })}
                className="flex flex-wrap gap-4"
              >
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value="automatic" id="pl-auto" />
                  <span>Advantage+ placements <span className="text-xs text-muted-foreground">(recommended — Meta picks the best placements)</span></span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <RadioGroupItem value="manual" id="pl-manual" />
                  <span>Choose placements manually</span>
                </label>
              </RadioGroup>
              {form.placement_mode === "manual" && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  {PLACEMENT_OPTIONS.map(([v, l]) => (
                    <div key={v} className="flex items-center gap-2">
                      <Checkbox
                        id={v}
                        checked={form.placements.includes(v)}
                        onCheckedChange={(checked) => {
                          setForm({
                            ...form,
                            placements_confirmed: true,
                            placements: checked
                              ? [...form.placements, v]
                              : form.placements.filter(x => x !== v)
                          });
                        }}
                      />
                      <Label htmlFor={v} className="text-sm">{l}</Label>
                    </div>
                  ))}
                </div>
              )}
              {!form.placements_confirmed && (
                <p className="text-xs text-warning">
                  {form.placement_mode === "manual"
                    ? "These placements were saved earlier but never sent to Meta. Saving this Ad Set applies them on the next \"Update on Meta\"."
                    : "Placements for this Ad Set are managed on Meta. Saving this Ad Set switches it to Advantage+ placements on the next \"Update on Meta\"."}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="sticky bottom-0 bg-background pt-3">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving} className="gap-2">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />} {editId ? "Save Changes" : "Create Ad Set"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerListAudienceDialog
        open={audienceDialogOpen}
        onOpenChange={setAudienceDialogOpen}
        adAccountId={selectedAdAccountId || null}
        onCreated={onAudienceCreated}
      />
    </div>
  );
}
