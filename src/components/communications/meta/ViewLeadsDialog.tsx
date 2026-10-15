// "Fetch leads" dialog for a lead-form (instant form) ad. Opening it reads the latest
// submissions from Meta into social_lead_submissions and lists them; nothing reaches
// Leads until "Save to Leads" is confirmed, which calls the
// meta-api action save_lead_submissions (interest = "Meta - <ad name>", no duplicates by phone).
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, Download, Loader2, RefreshCw, Save, Users } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { readMetaApiError } from "@/lib/metaErrors";
import { csvCell, triggerDownload } from "@/lib/audienceImport";
import { formatIst } from "@/lib/istTime";

export type ViewLeadsAd = { id: string; name: string; external_id: string | null; lead_form_id: string | null };

interface Props {
  ad: ViewLeadsAd | null;
  onOpenChange: (open: boolean) => void;
}

type FieldData = Array<{ name: string; values?: string[] }>;
type SubmissionRow = {
  id: string;
  external_id: string;
  form_external_id: string | null;
  created_time: string | null;
  is_organic: boolean | null;
  lead_id: string | null;
  field_data: FieldData | null;
};

// Meta's standard instant-form keys get pinned columns; every other key becomes its own column.
const STANDARD_KEYS = new Set(["full_name", "first_name", "last_name", "email", "phone_number", "phone"]);

function fieldMap(fieldData: FieldData | null | undefined) {
  const map: Record<string, string> = {};
  for (const f of fieldData || []) map[String(f.name).toLowerCase()] = (f.values || []).join(", ");
  return map;
}
const nameOf = (fm: Record<string, string>) => fm.full_name || [fm.first_name, fm.last_name].filter(Boolean).join(" ");
const phoneOf = (fm: Record<string, string>) => fm.phone_number || fm.phone || "";
const titleCase = (s: string) => s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export function ViewLeadsDialog({ ad, onOpenChange }: Props) {
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rows, setRows] = useState<SubmissionRow[]>([]);
  const [formName, setFormName] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [lastFetch, setLastFetch] = useState<{ fetched: number; created: number } | null>(null);

  const load = async (current: ViewLeadsAd) => {
    setLoading(true);
    const filters = [`ad_id.eq.${current.id}`];
    if (current.external_id) filters.push(`ad_external_id.eq.${current.external_id}`);
    if (current.lead_form_id) filters.push(`form_external_id.eq.${current.lead_form_id}`);
    const [{ data: subs }, { data: form }] = await Promise.all([
      supabase.from("social_lead_submissions").select("id, external_id, form_external_id, created_time, is_organic, lead_id, field_data").or(filters.join(",")).order("created_time", { ascending: false }),
      current.lead_form_id
        ? supabase.from("social_lead_forms").select("name").eq("external_id", current.lead_form_id).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
    ]);
    setRows((subs || []) as unknown as SubmissionRow[]);
    setFormName((form as { name?: string } | null)?.name || null);
    setLoading(false);
  };

  // Read the latest submissions from Meta into social_lead_submissions (no CRM write).
  const fetchFromMeta = async (current: ViewLeadsAd) => {
    setFetching(true);
    setFetchError(null);
    try {
      const { data, error } = await supabase.functions.invoke("meta-api", { body: { action: "sync_leads", payload: { ad_id: current.id } } });
      if (error || data?.error) setFetchError(await readMetaApiError(error, data));
      else setLastFetch({ fetched: Number(data?.fetched ?? 0), created: Number(data?.created ?? 0) });
    } finally {
      setFetching(false);
      await load(current);
    }
  };

  useEffect(() => {
    if (ad) {
      setRows([]); setFormName(null); setFetchError(null); setLastFetch(null);
      fetchFromMeta(ad);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ad?.id]);

  const customKeys = useMemo(() => {
    const seen = new Set<string>();
    const order: string[] = [];
    for (const r of rows) for (const f of r.field_data || []) {
      const k = String(f.name).toLowerCase();
      if (!STANDARD_KEYS.has(k) && !seen.has(k)) { seen.add(k); order.push(k); }
    }
    return order;
  }, [rows]);

  const unsaved = rows.filter((r) => !r.lead_id).length;

  const exportCsv = () => {
    if (!ad) return;
    const headers = ["Lead ID", "Submission Date", "Name", "Phone", "Email", "Ad Name", "Ad ID", "Form ID", "Type", "Saved to Leads", ...customKeys.map(titleCase)];
    const lines = [headers.map(csvCell).join(",")];
    for (const r of rows) {
      const fm = fieldMap(r.field_data);
      const cells = [
        r.external_id, r.created_time || "", nameOf(fm), phoneOf(fm), fm.email || "",
        ad.name || "", ad.external_id || "", r.form_external_id || ad.lead_form_id || "",
        r.is_organic ? "Organic" : "Paid ad", r.lead_id ? "Yes" : "No",
        ...customKeys.map((k) => fm[k] || ""),
      ];
      lines.push(cells.map((c) => csvCell(String(c))).join(","));
    }
    const safeName = (ad.name || "ad").replace(/[^a-z0-9]+/gi, "_");
    triggerDownload(new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }), `Meta_Leads_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const saveToLeads = async () => {
    if (!ad) return;
    setConfirmOpen(false);
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("meta-api", { body: { action: "save_lead_submissions", payload: { ad_id: ad.id } } });
      if (error || data?.error) {
        toast({ title: "Could not save leads", description: await readMetaApiError(error, data), variant: "destructive" });
        return;
      }
      const parts = [`${data.saved} saved to Leads`];
      if (data.already_in_leads) parts.push(`${data.already_in_leads} already in Leads (linked, not duplicated)`);
      if (data.skipped_no_phone) parts.push(`${data.skipped_no_phone} skipped (no phone number)`);
      toast({ title: `Interest set to "${data.interest}"`, description: parts.join(" · ") });
      await load(ad);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!ad} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        <DialogHeader className="border-b px-6 py-4">
          <DialogTitle>Leads from Meta · {ad?.name}</DialogTitle>
          <DialogDescription>
            {formName ? `Instant form: ${formName}. ` : ""}Responses people submitted on this ad. Nothing is added to Leads until you save.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 border-b px-6 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge variant="secondary" className="gap-1"><Users className="h-3 w-3" />{rows.length} lead{rows.length === 1 ? "" : "s"}</Badge>
            <Badge variant={unsaved ? "default" : "outline"}>{unsaved} not yet in Leads</Badge>
            {fetching ? (
              <span className="inline-flex items-center gap-1 text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Fetching from Meta…</span>
            ) : lastFetch ? (
              <span className="text-muted-foreground">Meta returned {lastFetch.fetched}, {lastFetch.created} new.</span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => ad && fetchFromMeta(ad)} disabled={fetching} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${fetching ? "animate-spin" : ""}`} /> Fetch from Meta
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} disabled={rows.length === 0} className="gap-2">
              <Download className="h-4 w-4" /> Export to CSV
            </Button>
            <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={unsaved === 0 || saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save to Leads
            </Button>
          </div>
        </div>

        {fetchError && (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <span>Meta could not be read: {fetchError} Showing what was fetched earlier.</span>
          </div>
        )}

        <div className="flex-1 overflow-auto px-6 py-4">
          {loading && rows.length === 0 ? (
            <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          ) : rows.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-16 text-center text-muted-foreground">
              <p>No submissions for this ad yet.</p>
              <p className="text-xs">Leads appear here once people fill in the instant form on Meta.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Date (IST)</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Email</TableHead>
                  {customKeys.map((k) => <TableHead key={k} className="whitespace-nowrap">{titleCase(k)}</TableHead>)}
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const fm = fieldMap(r.field_data);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs">{r.created_time ? formatIst(r.created_time) : "—"}</TableCell>
                      <TableCell className="font-medium">{nameOf(fm) || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{phoneOf(fm) || "—"}</TableCell>
                      <TableCell>{fm.email || "—"}</TableCell>
                      {customKeys.map((k) => <TableCell key={k}>{fm[k] || "—"}</TableCell>)}
                      <TableCell><Badge variant={r.is_organic ? "outline" : "secondary"}>{r.is_organic ? "Organic" : "Paid ad"}</Badge></TableCell>
                      <TableCell><Badge variant={r.lead_id ? "default" : "outline"}>{r.lead_id ? "Saved" : "Not saved"}</Badge></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </DialogContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Save {unsaved} lead{unsaved === 1 ? "" : "s"} to Leads?</AlertDialogTitle>
            <AlertDialogDescription>
              Each new lead gets the interest "Meta - {ad?.name}". A submission whose phone number already exists in Leads is linked to that lead and not duplicated; submissions without a phone number are skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={saveToLeads}>Save to Leads</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
