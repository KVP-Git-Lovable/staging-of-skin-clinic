import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { readMetaApiError } from "@/lib/metaErrors";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BackButton } from "@/components/shared/BackButton";
import { toast } from "@/hooks/use-toast";
import { BarChart3, Loader2, MoreHorizontal, Pause, Play, Plus, RefreshCw, Rocket, Trash2, Sparkles, Video, ImageIcon } from "lucide-react";
import { bareAdAccountId, loadMetaScope, type MetaAdAccount } from "@/lib/metaScope";
import { AdAccountSelect } from "@/components/communications/meta/AdAccountSelect";
import { useAdAccountFilter } from "@/hooks/useAdAccountFilter";
import { AdMediaPicker } from "@/components/communications/meta/AdMediaPicker";
import { META_CALL_TO_ACTIONS, describeMedia, normalizeMedia, type AdMedia } from "@/lib/adMedia";
import { LeadFormDialog } from "@/components/communications/meta/LeadFormDialog";
import { ViewLeadsDialog, type ViewLeadsAd } from "@/components/communications/meta/ViewLeadsDialog";
import { LEAD_ADS_TOS_URL, LEAD_CTA_OPTIONS, LEAD_CTA_TYPES, type LeadAdsReadiness, type LeadFormRow } from "@/lib/metaLeadForms";
import { ExternalLink, FileText } from "lucide-react";

type AdForm = {
  ad_set_id: string;
  name: string;
  format: "single" | "carousel";
  media: AdMedia | null;
  ai_media: boolean;
  primary_text: string;
  destination_enabled: boolean;
  destination_url: string;
  headline: string;
  description: string;
  call_to_action: string;
  multi_advertiser: boolean;
  status: string;
  /** Meta instant-form id; only used when the campaign objective is Leads. */
  lead_form_id: string;
  /** Instagram profile shown as the ad's identity (object_story_spec.instagram_user_id); "" = Page default. */
  instagram_user_id: string;
};

type AdInstagramAccount = { ad_account_id: string; id: string; username: string | null; profile_pic: string | null };

const emptyForm: AdForm = {
  ad_set_id: "",
  name: "",
  format: "single",
  media: null,
  ai_media: false,
  primary_text: "",
  destination_enabled: true,
  destination_url: "",
  headline: "",
  description: "",
  call_to_action: "LEARN_MORE",
  multi_advertiser: true,
  status: "paused",
  lead_form_id: "",
  instagram_user_id: "",
};

/** Meta's creative_type for the saved ad; existing rows keep "link". */
function creativeTypeFor(form: AdForm): string {
  if (form.media?.kind === "video") return "video";
  if (!form.destination_enabled) return "photo";
  return "link";
}

export default function MetaAds() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metaConnected, setMetaConnected] = useState(true);
  const [rows, setRows] = useState<any[]>([]);
  const [adsets, setAdsets] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<Array<{ id: string; name: string; ad_account_id?: string | null; objective?: string | null }>>([]);
  const [defaultPageId, setDefaultPageId] = useState<string>("");
  // Lead ads (campaign objective = Leads): instant forms of the ad set's Page + readiness checks.
  const [leadForms, setLeadForms] = useState<LeadFormRow[]>([]);
  const [leadFormsLoading, setLeadFormsLoading] = useState(false);
  const [leadReadiness, setLeadReadiness] = useState<LeadAdsReadiness | null>(null);
  const [leadBlocked, setLeadBlocked] = useState<string | null>(null);
  const [leadFormOpen, setLeadFormOpen] = useState(false);
  const [viewLeadsAd, setViewLeadsAd] = useState<ViewLeadsAd | null>(null);
  // "Choose Ad Account" filter: narrows campaigns → ad sets → ads to one ad account.
  const [adAccounts, setAdAccounts] = useState<MetaAdAccount[]>([]);
  const [accountFilter, applyAccountFilter] = useAdAccountFilter();
  const [open, setOpen] = useState(false);
  // Campaign / Ad Set filters for the list (pure view over `rows`; deep-linkable via ?campaign= & ?adset=).
  const [searchParams, setSearchParams] = useSearchParams();
  const [campaignFilter, setCampaignFilter] = useState<string>(searchParams.get("campaign") || "all");
  const [adSetFilter, setAdSetFilter] = useState<string>(searchParams.get("adset") || "all");
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<AdForm>({ ...emptyForm });
  const [pages, setPages] = useState<Array<{ page_id: string; page_name: string | null }>>([]);
  const [defaultAdAccountId, setDefaultAdAccountId] = useState<string>("");
  const [defaultAdIg, setDefaultAdIg] = useState<string>("");
  const [adIgAccounts, setAdIgAccounts] = useState<AdInstagramAccount[]>([]);
  const [adIgLoading, setAdIgLoading] = useState(false);
  const [adIgError, setAdIgError] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    setLoading(true);
    const scope = await loadMetaScope();
    if (!scope.connected) {
      setMetaConnected(false);
      setRows([]);
      setAdsets([]);
      setLoading(false);
      return;
    }
    setMetaConnected(true);
    setCampaigns(scope.campaigns);
    setAdAccounts(scope.adAccounts);
    const [{ data: ads }, { data: sets }] = await Promise.all([
      supabase.from("social_ads").select("*").order("created_at", { ascending: false }),
      supabase.from("social_ad_sets").select("id,name,external_id,campaign_id,page_id").order("created_at", { ascending: false }),
    ]);
    if (scope.connectionId) {
      const [{ data: connRow }, { data: pageRows }] = await Promise.all([
        supabase.from("social_connections").select("default_page_id, default_ad_account_id, default_ad_instagram_id").eq("id", scope.connectionId).maybeSingle(),
        supabase.from("social_pages").select("page_id, page_name").eq("connection_id", scope.connectionId),
      ]);
      setDefaultPageId(connRow?.default_page_id || "");
      setDefaultAdAccountId(bareAdAccountId(connRow?.default_ad_account_id) || "");
      setDefaultAdIg(connRow?.default_ad_instagram_id || "");
      setPages((pageRows || []) as Array<{ page_id: string; page_name: string | null }>);
    }
    const scopedSets = (sets || []).filter((s: any) => s.campaign_id && scope.campaignIds.has(s.campaign_id));
    const setIds = new Set(scopedSets.map((s: any) => s.id));
    setRows((ads || []).filter((a: any) => a.ad_set_id && setIds.has(a.ad_set_id)));
    setAdsets(scopedSets);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const syncFilterParams = (campaign: string, adSet: string) => {
    const next = new URLSearchParams(searchParams);
    if (campaign === "all") next.delete("campaign"); else next.set("campaign", campaign);
    if (adSet === "all") next.delete("adset"); else next.set("adset", adSet);
    setSearchParams(next, { replace: true });
  };

  const campaignsInAccount = useMemo(
    () => (accountFilter === "all" ? campaigns : campaigns.filter((c) => bareAdAccountId(c.ad_account_id) === accountFilter)),
    [campaigns, accountFilter],
  );
  const campaignIdsInAccount = useMemo(() => new Set(campaignsInAccount.map((c) => c.id)), [campaignsInAccount]);
  const adSetsForFilter = useMemo(
    () => adsets.filter((s) => (accountFilter === "all" || campaignIdsInAccount.has(s.campaign_id)) && (campaignFilter === "all" || s.campaign_id === campaignFilter)),
    [adsets, campaignFilter, accountFilter, campaignIdsInAccount],
  );

  const applyCampaignFilter = (value: string) => {
    const keepAdSet = value === "all" || adsets.some((s) => s.id === adSetFilter && s.campaign_id === value);
    const nextAdSet = keepAdSet ? adSetFilter : "all";
    setCampaignFilter(value);
    setAdSetFilter(nextAdSet);
    syncFilterParams(value, nextAdSet);
  };

  const applyAdSetFilter = (value: string) => {
    setAdSetFilter(value);
    syncFilterParams(campaignFilter, value);
  };

  const adSetCampaignId = (adSetId: string) => adsets.find((s) => s.id === adSetId)?.campaign_id;
  const adSetPageId = (adSetId: string) => adsets.find((s) => s.id === adSetId)?.page_id || defaultPageId;
  // Ad account the ad will be created in (campaign's account, else the default) — decides which Instagram profiles are offered.
  const adSetAdAccountId = (adSetId: string) =>
    bareAdAccountId(campaigns.find((c) => c.id === adSetCampaignId(adSetId))?.ad_account_id) || defaultAdAccountId;
  const identityPageId = adSetPageId(form.ad_set_id);
  const identityPageLabel = pages.find((p) => p.page_id === identityPageId)?.page_name || identityPageId || "Set a Page on the ad set or a default Page";

  useEffect(() => {
    if (!open) return;
    const act = adSetAdAccountId(form.ad_set_id);
    if (!act) { setAdIgAccounts([]); setAdIgError(""); return; }
    let cancelled = false;
    (async () => {
      setAdIgLoading(true);
      setAdIgError("");
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: { action: "list_ad_instagram_accounts", payload: { ad_account_id: act } },
      });
      if (cancelled) return;
      setAdIgLoading(false);
      if (error || data?.error) { setAdIgError(await readMetaApiError(error, data)); setAdIgAccounts([]); return; }
      setAdIgAccounts((data?.accounts || []) as AdInstagramAccount[]);
      const first = (data?.errors || [])[0];
      if (first?.message) setAdIgError(String(first.message));
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, form.ad_set_id, defaultAdAccountId]);
  const isLeadCampaignFor = (adSetId: string) => campaigns.find((c) => c.id === adSetCampaignId(adSetId))?.objective === "leads";
  const isLeadCampaign = isLeadCampaignFor(form.ad_set_id);
  const leadPageId = adSetPageId(form.ad_set_id);

  const loadLeadForms = async (pageId: string) => {
    if (!pageId) { setLeadForms([]); return; }
    setLeadFormsLoading(true);
    const [formsRes, readyRes] = await Promise.all([
      supabase.functions.invoke("meta-api", { body: { action: "list_lead_forms", payload: { page_id: pageId } } }),
      supabase.functions.invoke("meta-api", { body: { action: "lead_ads_readiness", payload: { page_id: pageId } } }),
    ]);
    setLeadFormsLoading(false);
    if (formsRes.error || formsRes.data?.error) {
      toast({ title: "Could not load lead forms", description: await readMetaApiError(formsRes.error, formsRes.data), variant: "destructive" });
      setLeadForms([]);
    } else {
      setLeadForms((formsRes.data?.forms || []) as LeadFormRow[]);
      setLeadBlocked(formsRes.data?.blocked ? String(formsRes.data.blocked) : null);
    }
    setLeadReadiness(readyRes.error ? { error: readyRes.error.message } : (readyRes.data as LeadAdsReadiness));
  };
  useEffect(() => {
    if (open && isLeadCampaign) loadLeadForms(leadPageId);
  }, [open, isLeadCampaign, leadPageId]);
  const leadReady = !!leadReadiness && leadReadiness.tos_accepted === true && (leadReadiness.missing_permissions || []).length === 0;
  const campaignName = (campaignId: string | undefined) => campaigns.find((c) => c.id === campaignId)?.name || "—";

  const changeAccountFilter = (value: string) => {
    applyAccountFilter(value);
    // Drop campaign / ad set filters that no longer belong to the chosen account.
    if (campaignFilter !== "all" && value !== "all" && !campaigns.some((c) => c.id === campaignFilter && bareAdAccountId(c.ad_account_id) === value)) {
      applyCampaignFilter("all");
    }
  };
  const sortedCampaigns = useMemo(() => [...campaignsInAccount].sort((a, b) => String(a.name).localeCompare(String(b.name))), [campaignsInAccount]);
  const visibleRows = useMemo(
    () => rows.filter((a) =>
      (accountFilter === "all" || campaignIdsInAccount.has(adSetCampaignId(a.ad_set_id) || "")) &&
      (campaignFilter === "all" || adSetCampaignId(a.ad_set_id) === campaignFilter) &&
      (adSetFilter === "all" || a.ad_set_id === adSetFilter)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, adsets, campaignFilter, adSetFilter, accountFilter, campaignIdsInAccount],
  );

  const openEdit = (row: any) => {
    setEditId(row.id);
    setForm({
      ad_set_id: row.ad_set_id,
      name: row.name,
      format: row.format === "carousel" ? "carousel" : "single",
      media: normalizeMedia(row.media),
      ai_media: !!row.ai_media,
      primary_text: row.primary_text || "",
      destination_enabled: row.destination_enabled !== false,
      destination_url: row.destination_url || "",
      headline: row.headline || "",
      description: row.description || "",
      call_to_action: row.call_to_action || "LEARN_MORE",
      multi_advertiser: row.multi_advertiser !== false,
      status: row.status || "paused",
      lead_form_id: row.lead_form_id || "",
      instagram_user_id: row.instagram_user_id || "",
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.ad_set_id || !form.name.trim()) {
      toast({ title: "Ad Set and name are required", variant: "destructive" });
      return;
    }
    if (isLeadCampaign) {
      if (!form.lead_form_id) {
        toast({ title: "Choose a lead form", description: "This campaign's objective is Leads. Pick an existing instant form or create one.", variant: "destructive" });
        return;
      }
      if (!LEAD_CTA_TYPES.has(form.call_to_action)) {
        toast({ title: "Call to action not allowed for lead ads", description: "Pick Sign Up, Learn More, Get Quote, Apply Now, Subscribe or Download.", variant: "destructive" });
        return;
      }
      if (!form.media) {
        toast({ title: "Add an image or video", description: "Lead ads need media.", variant: "destructive" });
        return;
      }
    } else {
      if (form.destination_enabled && !form.destination_url.trim()) {
        toast({ title: "Destination URL is required", description: "Enter a URL or untick \"Add a destination\".", variant: "destructive" });
        return;
      }
      if (!form.destination_enabled && !form.media) {
        toast({ title: "Add an image or video", description: "An ad without a destination needs media.", variant: "destructive" });
        return;
      }
    }
    setSaving(true);
    const payload = {
      platform: "meta",
      ad_set_id: form.ad_set_id,
      name: form.name.trim(),
      format: form.format,
      media: form.media ? { ...form.media } : {},
      ai_media: form.ai_media,
      primary_text: form.primary_text,
      destination_enabled: form.destination_enabled,
      destination_url: form.destination_enabled ? form.destination_url.trim() : form.destination_url.trim() || null,
      headline: form.headline,
      description: form.description,
      call_to_action: form.call_to_action,
      multi_advertiser: form.multi_advertiser,
      status: form.status,
      creative_type: creativeTypeFor(form),
      // Ads Manager "Identity → Instagram profile"; null = Page-backed default.
      instagram_user_id: form.instagram_user_id || null,
      // Lead campaigns: the instant form is the destination (Meta fixes link to https://fb.me/).
      ...(isLeadCampaign
        ? { lead_form_id: form.lead_form_id, destination_enabled: false, destination_url: null, creative_type: "lead_form" }
        : {}),
    };
    const { error } = editId
      ? await supabase.from("social_ads").update(payload).eq("id", editId)
      : await supabase.from("social_ads").insert(payload);
    setSaving(false);
    if (error) { toast({ title: "Could not save", description: error.message, variant: "destructive" }); return; }
    toast({ title: editId ? "Ad updated" : "Ad created" });
    setOpen(false);
    load();
  };

  const readError = readMetaApiError;

  const callApi = async (action: string, ad_id: string, message: string) => {
    if (action === "publish_ad") {
      const row = rows.find((r) => r.id === ad_id);
      const media = normalizeMedia(row?.media);
      if (media?.kind === "video" && media.video_status !== "ready") {
        toast({
          title: media.video_id ? "Video still processing on Meta" : "Video not registered on Meta",
          description: "Open the ad and wait for the video to show Ready, then publish.",
          variant: "destructive",
        });
        return;
      }
    }
    setBusyId(ad_id);
    const { data, error } = await supabase.functions.invoke("meta-api", { body: { action, payload: { ad_id } } });
    setBusyId(null);
    if (error || data?.error) {
      toast({ title: "Action failed", description: await readError(error, data), variant: "destructive" });
      return;
    }
    toast({
      title: message,
      description: data?.external_id
        ? `Meta Ad ID: ${data.external_id}`
        : data?.fetched != null
          ? `${data.created} new lead(s) added under Leads, ${data.skipped} already imported (${data.fetched} read from Meta).`
          : undefined,
    });
    load();
  };

  const syncStatuses = async () => {
    setSyncing(true);
    const { data, error } = await supabase.functions.invoke("meta-api", { body: { action: "sync_ad_status", payload: {} } });
    setSyncing(false);
    if (error || data?.error) {
      toast({ title: "Sync failed", description: await readError(error, data), variant: "destructive" });
      return;
    }
    toast({ title: "Statuses synced from Meta" });
    load();
  };

  const mediaCell = (row: any) => {
    const media = normalizeMedia(row.media);
    if (!media) return <span className="text-xs text-muted-foreground">No media</span>;
    const thumb = media.kind === "video" ? media.thumbnail_url : media.url;
    return (
      <div className="flex items-center gap-2">
        <div className="h-9 w-9 shrink-0 overflow-hidden rounded border bg-muted">
          {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" /> : <Video className="m-auto mt-2 h-5 w-5 text-muted-foreground" />}
        </div>
        <div className="text-xs">
          <div className="flex items-center gap-1">
            {media.kind === "video" ? <Video className="h-3 w-3" /> : <ImageIcon className="h-3 w-3" />}
            <span>{describeMedia(media)}</span>
          </div>
          {row.ai_media && <Badge variant="outline" className="mt-0.5 gap-1 text-[10px]"><Sparkles className="h-3 w-3" /> AI media</Badge>}
        </div>
      </div>
    );
  };

  const videoNotReady = form.media?.kind === "video" && form.media.video_status !== "ready";

  return <div className="space-y-6">
    <BackButton />
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div><h1 className="text-2xl font-semibold md:text-3xl">Ads</h1><p className="mt-1 text-muted-foreground">Create ads and republish edited creative details to Meta.</p></div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={syncStatuses} disabled={syncing} className="gap-2">{syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Sync Status</Button>
        <Button onClick={() => { setEditId(null); setForm({ ...emptyForm, ad_set_id: adSetFilter !== "all" && adsets.some((s) => s.id === adSetFilter) ? adSetFilter : "" , instagram_user_id: defaultAdIg }); setOpen(true); }} className="gap-2"><Plus className="h-4 w-4" /> Create Ad</Button>
      </div>
    </div>

    {metaConnected && !loading && (
      <AdAccountSelect accounts={adAccounts} value={accountFilter} onChange={changeAccountFilter} />
    )}

    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>All Ads</CardTitle>
          {metaConnected && !loading && (
            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">Campaign</Label>
              <Select value={campaignFilter} onValueChange={applyCampaignFilter}>
                <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="All campaigns" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All campaigns</SelectItem>
                  {sortedCampaigns.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Label className="text-xs text-muted-foreground">Ad Set</Label>
              <Select value={adSetFilter} onValueChange={applyAdSetFilter}>
                <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="All ad sets" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="all">All ad sets</SelectItem>
                  {adSetsForFilter.map((set) => <SelectItem key={set.id} value={set.id}>{set.name}{set.external_id ? "" : " (not published)"}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">Showing {visibleRows.length} of {rows.length}</span>
              {(campaignFilter !== "all" || adSetFilter !== "all" || accountFilter !== "all") && (
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
        <p className="py-10 text-center text-muted-foreground">Connect your Meta account in Communication Center &gt; Meta to view ads</p>
      ) : rows.length === 0 ? <p className="py-10 text-center text-muted-foreground">No ads yet.</p> : visibleRows.length === 0 ? <p className="py-10 text-center text-muted-foreground">No ads match the selected ad account / campaign / ad set.</p> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Ad</TableHead><TableHead>Media</TableHead><TableHead>Campaign</TableHead><TableHead>Ad Set</TableHead><TableHead>Status</TableHead><TableHead>Meta ID</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader><TableBody>
        {visibleRows.map((row) => <TableRow key={row.id} className="cursor-pointer" onClick={() => openEdit(row)}><TableCell className="font-medium">{row.name}{row.lead_form_id && <Badge variant="outline" className="ml-2 text-[10px] font-normal"><FileText className="mr-1 h-3 w-3" />Lead form</Badge>}</TableCell><TableCell>{mediaCell(row)}</TableCell><TableCell className="whitespace-nowrap">{campaignName(adSetCampaignId(row.ad_set_id))}</TableCell><TableCell>{adsets.find((item) => item.id === row.ad_set_id)?.name || "—"}</TableCell><TableCell><Badge variant={row.status === "active" ? "default" : "secondary"}>{row.status}</Badge></TableCell><TableCell className="font-mono text-xs">{row.external_id || "—"}</TableCell><TableCell className="text-right" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" disabled={busyId === row.id}>{busyId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => openEdit(row)}>Edit</DropdownMenuItem><DropdownMenuItem className="gap-2" onClick={() => callApi("publish_ad", row.id, row.external_id ? "Ad republished" : "Ad published")}><Rocket className="h-4 w-4" />{row.external_id ? "Republish Changes" : "Publish"}</DropdownMenuItem>{row.external_id && (row.status === "active" ? <DropdownMenuItem className="gap-2" onClick={() => callApi("pause_ad", row.id, "Ad paused")}><Pause className="h-4 w-4" />Pause</DropdownMenuItem> : <DropdownMenuItem className="gap-2" onClick={() => callApi("resume_ad", row.id, "Ad resumed")}><Play className="h-4 w-4" />Resume</DropdownMenuItem>)}{row.external_id && <DropdownMenuItem className="gap-2" onClick={() => navigate(`/communications/meta/ads/${row.id}/performance`)}><BarChart3 className="h-4 w-4" />View Ad Performance</DropdownMenuItem>}{row.lead_form_id && row.external_id && <DropdownMenuItem className="gap-2" onClick={() => setViewLeadsAd({ id: row.id, name: row.name, external_id: row.external_id, lead_form_id: row.lead_form_id })}><FileText className="h-4 w-4" />Fetch leads</DropdownMenuItem>}<DropdownMenuItem className="gap-2 text-destructive" onClick={() => callApi("delete_ad", row.id, "Ad deleted")}><Trash2 className="h-4 w-4" />Delete</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>)}
      </TableBody></Table></div>}
    </CardContent></Card>

    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader><DialogTitle>{editId ? "Edit Ad" : "Create Ad"}</DialogTitle></DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Ad Set</Label><Select value={form.ad_set_id} onValueChange={(value) => setForm({ ...form, ad_set_id: value })}><SelectTrigger><SelectValue placeholder="Select a published ad set" /></SelectTrigger><SelectContent>{adsets.map((set) => <SelectItem key={set.id} value={set.id}>{set.name}{set.external_id ? "" : " (not published)"}</SelectItem>)}</SelectContent></Select></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Ad Name</Label><Input className="text-base" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></div>

          {/* ---------------------------- Ad setup ---------------------------- */}
          <div className="space-y-2 sm:col-span-2 border-t pt-4">
            <h3 className="text-sm font-medium">Ad setup</h3>
            <Label className="text-xs text-muted-foreground">Format · choose an ad creative layout</Label>
            <RadioGroup value={form.format} onValueChange={(v) => setForm({ ...form, format: v as AdForm["format"] })} className="flex flex-wrap gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <RadioGroupItem value="single" id="fmt-single" />
                <span>Single image or video</span>
              </label>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <RadioGroupItem value="carousel" id="fmt-carousel" disabled />
                <span>Carousel <span className="text-xs">(coming soon)</span></span>
              </label>
            </RadioGroup>
          </div>

          {/* --------------------------- Ad creative -------------------------- */}
          <div className="space-y-1.5 sm:col-span-2 border-t pt-4">
            <h3 className="text-sm font-medium">Ad creative</h3>
            <p className="text-xs text-muted-foreground">Select your ad media and text.</p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Media</Label>
            <AdMediaPicker
              value={form.media}
              onChange={(media) => setForm((f) => ({ ...f, media }))}
              adSetId={form.ad_set_id}
              title={form.name || "Ad video"}
            />
          </div>
          <div className="flex items-start gap-2 sm:col-span-2">
            <Checkbox id="ai-media" checked={form.ai_media} onCheckedChange={(c) => setForm({ ...form, ai_media: c === true })} className="mt-0.5" />
            <div>
              <Label htmlFor="ai-media" className="text-sm font-normal">Ad includes media created or edited with AI</Label>
              <p className="text-xs text-muted-foreground">Recorded with this ad for your reference. Meta adds its "AI info" label through Ads Manager and its own detection; the Marketing API has no field for it.</p>
            </div>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Primary Text</Label><Textarea value={form.primary_text} onChange={(event) => setForm({ ...form, primary_text: event.target.value })} /></div>

          {/* ----------------------------- Identity ----------------------------- */}
          <div className="space-y-1.5 sm:col-span-2 border-t pt-4">
            <h3 className="text-sm font-medium">Identity</h3>
            <p className="text-xs text-muted-foreground">The profiles that will be used in your ad, as in Ads Manager.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Facebook Page</Label>
            <Input readOnly value={identityPageLabel} className="bg-muted text-base" />
          </div>
          <div className="space-y-1.5">
            <Label>Instagram profile</Label>
            <Select
              value={form.instagram_user_id || "__page__"}
              onValueChange={(v) => setForm({ ...form, instagram_user_id: v === "__page__" ? "" : v })}
              disabled={adIgLoading}
            >
              <SelectTrigger><SelectValue placeholder={adIgLoading ? "Loading from Meta…" : "Page default"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__page__">Page default (Page-backed Instagram account)</SelectItem>
                {adIgAccounts.map((a) => <SelectItem key={a.id} value={a.id}>@{a.username || a.id}</SelectItem>)}
                {form.instagram_user_id && !adIgAccounts.some((a) => a.id === form.instagram_user_id) && (
                  <SelectItem value={form.instagram_user_id}>{form.instagram_user_id} (saved)</SelectItem>
                )}
              </SelectContent>
            </Select>
            {adIgError ? (
              <p className="text-xs text-destructive">{adIgError}</p>
            ) : !adIgLoading && adIgAccounts.length === 0 ? (
              <p className="text-xs text-muted-foreground">No Instagram profile is attached to this ad account on Meta. Add it under Business settings → Instagram profiles → Connect assets.</p>
            ) : null}
          </div>

          {isLeadCampaign ? (
            <>
              {/* --------------------------- Lead form -------------------------- */}
              <div className="space-y-1.5 sm:col-span-2 border-t pt-4">
                <h3 className="text-sm font-medium">Lead form (instant form)</h3>
                <p className="text-xs text-muted-foreground">This campaign's objective is Leads. People fill in the form on Facebook / Instagram instead of visiting a website; Meta sets the destination to the form.</p>
              </div>
              {!leadPageId && (
                <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  Choose a Facebook Page on the ad set (or a default Page under Communication Center → Meta) to create or pick a lead form.
                </div>
              )}
              {leadReadiness && (leadReadiness.tos_accepted === false || (leadReadiness.missing_permissions || []).length > 0 || (leadReadiness.errors || []).length > 0) && (
                <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 space-y-1">
                  {leadReadiness.tos_accepted === false && (
                    <div>A Page admin must accept Meta's Lead Ads Terms for {leadReadiness.page_name || "this Page"} before forms can be created: <a className="underline inline-flex items-center gap-1" href={LEAD_ADS_TOS_URL} target="_blank" rel="noreferrer">open the terms <ExternalLink className="h-3 w-3" /></a></div>
                  )}
                  {(leadReadiness.missing_permissions || []).length > 0 && (
                    <div>Meta permissions missing on this connection: {leadReadiness.missing_permissions!.join(", ")}. Open Communication Center → Meta and press Connect with Facebook again to grant them.</div>
                  )}
                  {(leadReadiness.errors || []).map((e) => <div key={e}>{e}</div>)}
                </div>
              )}
              {leadBlocked && (
                <div className="sm:col-span-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
                  Meta refused to list or create forms on this Page: {leadBlocked}
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Lead form *</Label>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={form.lead_form_id} onValueChange={(value) => setForm({ ...form, lead_form_id: value })} disabled={leadFormsLoading || !leadPageId}>
                    <SelectTrigger className="flex-1 min-w-[240px]"><SelectValue placeholder={leadFormsLoading ? "Loading forms from Meta…" : leadForms.length ? "Pick an instant form" : "No forms on this Page yet"} /></SelectTrigger>
                    <SelectContent className="max-h-72">
                      {leadForms.filter((f) => f.external_id || f.status === "PENDING_META").map((f) => (
                        <SelectItem key={f.external_id || f.id} value={f.external_id || `pending:${f.id}`} disabled={f.status === "ARCHIVED" || f.status === "DELETED"}>
                          {f.name} <span className="text-xs text-muted-foreground">· {f.status === "PENDING_META" ? "waiting for Meta" : f.status.toLowerCase()} · {f.leads_count} lead{f.leads_count === 1 ? "" : "s"}{f.imported ? " · from Ads Manager" : ""}</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="button" variant="outline" onClick={() => setLeadFormOpen(true)} disabled={!leadPageId} title={!leadReady ? "Meta isn't ready yet: the form is saved here and sent to Meta automatically once the notices above are resolved" : undefined}>
                    <Plus className="mr-1 h-4 w-4" />Create Lead form
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => loadLeadForms(leadPageId)} disabled={!leadPageId || leadFormsLoading} title="Refresh forms from Meta">
                    {leadFormsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Headline</Label><Input className="text-base" value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Call to Action</Label><Select value={LEAD_CTA_TYPES.has(form.call_to_action) ? form.call_to_action : "SIGN_UP"} onValueChange={(value) => setForm({ ...form, call_to_action: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{LEAD_CTA_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Input className="text-base" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Include additional details" /></div>
            </>
          ) : (
            <>
          <div className="flex items-start gap-2 sm:col-span-2">
            <Checkbox id="dest-on" checked={form.destination_enabled} onCheckedChange={(c) => setForm({ ...form, destination_enabled: c === true })} className="mt-0.5" />
            <div>
              <Label htmlFor="dest-on" className="text-sm font-normal">Add a destination</Label>
              <p className="text-xs text-muted-foreground">Send people to a website after they tap the ad. Without a destination they are sent to your Facebook Page, and the ad runs as a plain photo or video post.</p>
            </div>
          </div>
          {form.destination_enabled && (
            <>
              <div className="space-y-1.5 sm:col-span-2"><Label>Destination URL *</Label><Input type="url" className="text-base" value={form.destination_url} onChange={(event) => setForm({ ...form, destination_url: event.target.value })} placeholder="https://" /></div>
              <div className="space-y-1.5"><Label>Headline</Label><Input className="text-base" value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} /></div>
              <div className="space-y-1.5"><Label>Call to Action</Label><Select value={form.call_to_action} onValueChange={(value) => setForm({ ...form, call_to_action: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{META_CALL_TO_ACTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Input className="text-base" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Include additional details" /></div>
            </>
          )}
          {!form.destination_enabled && form.media?.kind === "video" && (
            <div className="space-y-1.5 sm:col-span-2"><Label>Headline (video title)</Label><Input className="text-base" value={form.headline} onChange={(event) => setForm({ ...form, headline: event.target.value })} /></div>
          )}

            </>
          )}

          <div className="flex items-start gap-2 sm:col-span-2 border-t pt-4">
            <Checkbox id="multi-adv" checked={form.multi_advertiser} onCheckedChange={(c) => setForm({ ...form, multi_advertiser: c === true })} className="mt-0.5" />
            <div>
              <Label htmlFor="multi-adv" className="text-sm font-normal">Multi-advertiser ads</Label>
              <p className="text-xs text-muted-foreground">Your ad can appear with others in the same ad unit to help promote discoverability. Your ad creative may be resized or cropped.</p>
            </div>
          </div>

          <div className="space-y-1.5"><Label>Status</Label><Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="paused">Paused</SelectItem><SelectItem value="active">Active</SelectItem></SelectContent></Select></div>
        </div>
        <DialogFooter className="sticky bottom-0 flex-col items-stretch gap-2 bg-background pt-3 sm:flex-row sm:items-center">
          {videoNotReady && <p className="text-xs text-muted-foreground sm:mr-auto">You can save now; publishing needs the video to show Ready on Meta.</p>}
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{editId ? "Save Changes" : "Create Ad"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <ViewLeadsDialog
      ad={viewLeadsAd}
      onOpenChange={(isOpen) => !isOpen && setViewLeadsAd(null)}
    />

    {leadPageId && (
      <LeadFormDialog
        open={leadFormOpen}
        onOpenChange={setLeadFormOpen}
        pageId={leadPageId}
        onCreated={(created) => {
          setLeadForms((cur) => [created, ...cur.filter((f) => f.id !== created.id)]);
          const value = created.external_id || `pending:${created.id}`;
          setForm((f) => ({ ...f, lead_form_id: value, call_to_action: LEAD_CTA_TYPES.has(f.call_to_action) ? f.call_to_action : "SIGN_UP" }));
        }}
      />
    )}
  </div>;
}
