import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, ListFilter, Loader2, Upload, XCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { readMetaApiError } from "@/lib/metaErrors";
import {
  AUDIENCE_LIST_VIEW_ENTITIES,
  MAX_AUDIENCE_ROWS,
  MIN_AUDIENCE_ROWS,
  downloadAudienceErrorRows,
  downloadAudienceTemplateCSV,
  downloadAudienceTemplateXLSX,
  listViewEntityLabel,
  parseAudienceFile,
  rowsFromListView,
  viewFiltersFromRow,
  type AudienceEntity,
  type AudienceInputRow,
  summarizeAudienceRows,
  validateAudienceRows,
  type AudienceListView,
  type ValidatedAudienceRow,
} from "@/lib/audienceImport";

type Source = "file" | "list_view";
type Step = "source" | "input" | "review";
type FilterMode = "all" | "valid" | "invalid";

export type CreatedAudience = {
  id: string;
  external_id: string;
  name: string;
  row_count: number;
  ad_account_id: string;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Ad account ("act_…") the audience is created under. */
  adAccountId: string | null;
  onCreated: (audience: CreatedAudience) => void;
}

const PREVIEW_ROWS = 200;

/**
 * "Custom audience → Customer list" wizard.
 * Step 1 pick a source, step 2 upload a file or choose a List View, step 3 review
 * the validated rows, name the audience and create it on Meta.
 */
export function CustomerListAudienceDialog({ open, onOpenChange, adAccountId, onCreated }: Props) {
  const [step, setStep] = useState<Step>("source");
  const [source, setSource] = useState<Source>("file");
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("");
  const [rows, setRows] = useState<ValidatedAudienceRow[]>([]);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [originLabel, setOriginLabel] = useState("");
  const [originRef, setOriginRef] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // List View picker state
  const [entity, setEntity] = useState<AudienceEntity>("patients");
  const [views, setViews] = useState<AudienceListView[]>([]);
  const [viewId, setViewId] = useState("");
  // Rows of the selected view, loaded once on selection (the count shown and the rows used are the same).
  const [viewRows, setViewRows] = useState<AudienceInputRow[] | null>(null);
  const viewCount = viewRows ? viewRows.length : null;

  const stats = useMemo(() => summarizeAudienceRows(rows), [rows]);

  const filteredRows = useMemo(() => {
    const list = filter === "all"
      ? rows
      : rows.filter((r) => {
          const hasErr = r.issues.some((x) => x.severity === "error");
          return filter === "invalid" ? hasErr : !hasErr;
        });
    return list.slice(0, PREVIEW_ROWS);
  }, [rows, filter]);

  const tooFew = stats.valid < MIN_AUDIENCE_ROWS;
  const tooMany = stats.valid > MAX_AUDIENCE_ROWS;

  const reset = () => {
    setStep("source");
    setSource("file");
    setRows([]);
    setFilter("all");
    setOriginLabel("");
    setOriginRef(null);
    setName("");
    setDescription("");
    setViewId("");
    setViewRows(null);
    setBusy(false);
    setBusyLabel("");
  };

  const handleClose = (next: boolean) => {
    if (busy) return;
    if (!next) reset();
    onOpenChange(next);
  };

  // Load List Views for the chosen object whenever the picker is shown.
  useEffect(() => {
    if (!open || step !== "input" || source !== "list_view") return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("list_views")
        .select("id, name, section, filter_match, filters")
        .eq("section", entity)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        toast({ title: "Could not load list views", description: error.message, variant: "destructive" });
        return;
      }
      setViews((data || []).map((v) => ({
        id: v.id,
        name: v.name,
        entity_type: entity,
        filters: viewFiltersFromRow(v),
      })));
      setViewId("");
      setViewRows(null);
    })();
    return () => { cancelled = true; };
  }, [open, step, source, entity]);

  // Load the selected view's rows so the count is exact and "Load rows" is instant.
  useEffect(() => {
    const view = views.find((v) => v.id === viewId);
    if (!view) { setViewRows(null); return; }
    let cancelled = false;
    setViewRows(null);
    rowsFromListView(view)
      .then((r) => { if (!cancelled) setViewRows(r); })
      .catch((e) => {
        if (cancelled) return;
        toast({ title: "Could not load list view", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
      });
    return () => { cancelled = true; };
  }, [viewId, views]);

  const applyRows = (input: Parameters<typeof validateAudienceRows>[0], label: string, ref: string | null) => {
    if (input.length > MAX_AUDIENCE_ROWS * 2) {
      throw new Error(`Too many rows (${input.length}). A customer list can hold at most ${MAX_AUDIENCE_ROWS.toLocaleString("en-IN")} people.`);
    }
    const validated = validateAudienceRows(input);
    setRows(validated);
    setOriginLabel(label);
    setOriginRef(ref);
    setName((n) => n || label.replace(/\.(csv|xlsx|xls)$/i, ""));
    setFilter("all");
    setStep("review");
  };

  const handleFile = async (file: File) => {
    setBusy(true);
    setBusyLabel("Reading file…");
    try {
      const parsed = await parseAudienceFile(file);
      applyRows(parsed, file.name, null);
    } catch (e) {
      toast({ title: "Could not read file", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
      setBusyLabel("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleLoadView = async () => {
    const view = views.find((v) => v.id === viewId);
    if (!view) return;
    setBusy(true);
    setBusyLabel("Loading list view rows…");
    try {
      const input = viewRows ?? await rowsFromListView(view);
      applyRows(input, view.name, view.id);
    } catch (e) {
      toast({ title: "Could not load list view", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const handleCreate = async () => {
    if (!adAccountId) {
      toast({ title: "Select a campaign first", description: "The audience is created under the campaign's ad account.", variant: "destructive" });
      return;
    }
    if (!name.trim()) {
      toast({ title: "Audience name is required", variant: "destructive" });
      return;
    }
    if (tooFew || tooMany) return;

    const payloadRows = rows
      .filter((r) => r.resolved)
      .map((r) => ({ email: r.resolved!.email ?? undefined, phone: r.resolved!.phone ?? undefined }));

    setBusy(true);
    setBusyLabel(`Uploading ${payloadRows.length.toLocaleString("en-IN")} rows to Meta…`);
    try {
      const { data, error } = await supabase.functions.invoke("meta-api", {
        body: {
          action: "create_customer_list_audience",
          payload: {
            name: name.trim(),
            description: description.trim() || null,
            ad_account_id: adAccountId,
            origin: source,
            origin_ref: originRef ?? originLabel,
            invalid_count: stats.invalid,
            duplicate_count: stats.duplicates,
            rows: payloadRows,
          },
        },
      });
      if (error || data?.error) {
        const message = await readMetaApiError(error, data);
        toast({ title: "Could not create audience", description: message, variant: "destructive" });
        return;
      }
      toast({
        title: "Customer list uploaded to Meta",
        description: "Meta usually takes a few hours to finish matching the list to accounts.",
      });
      onCreated(data.audience as CreatedAudience);
      reset();
      onOpenChange(false);
    } finally {
      setBusy(false);
      setBusyLabel("");
    }
  };

  const stepIndex = step === "source" ? 1 : step === "input" ? 2 : 3;
  const stepLabel = step === "source"
    ? "Choose a source"
    : step === "input"
      ? (source === "file" ? "Upload your customer list" : "Pick a saved view")
      : "Review & create";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl w-[95vw] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Customer list audience</DialogTitle>
          <DialogDescription>Step {stepIndex} of 3 · {stepLabel}</DialogDescription>
        </DialogHeader>

        {step === "source" && (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Reach people who have already interacted with your business. Meta matches the emails and
              phone numbers you provide to Facebook and Instagram accounts; the ad set is then shown only to
              them. Every row needs an email or a phone, and Meta requires at least {MIN_AUDIENCE_ROWS} people.
            </p>
            <RadioGroup value={source} onValueChange={(v) => setSource(v as Source)} className="grid gap-3 sm:grid-cols-2">
              <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${source === "file" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="file" id="src-file" className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium"><FileSpreadsheet className="h-4 w-4" /> Upload a file</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Download the sample template, fill in emails / phones, upload the CSV or Excel file.</span>
                </span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 ${source === "list_view" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="list_view" id="src-view" className="mt-0.5" />
                <span>
                  <span className="flex items-center gap-2 text-sm font-medium"><ListFilter className="h-4 w-4" /> Import from a saved view</span>
                  <span className="mt-1 block text-xs text-muted-foreground">Use the contacts of an existing Patients or Leads saved view. Nothing to download.</span>
                </span>
              </label>
            </RadioGroup>
            <div className="flex justify-end gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => handleClose(false)}>Cancel</Button>
              <Button onClick={() => setStep("input")}>Next</Button>
            </div>
          </div>
        )}

        {step === "input" && source === "file" && (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap gap-2">
              <Button onClick={downloadAudienceTemplateXLSX} variant="outline">
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Download Excel template
              </Button>
              <Button onClick={downloadAudienceTemplateCSV} variant="outline">
                <Download className="mr-2 h-4 w-4" /> Download CSV template
              </Button>
            </div>
            <div className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>
                Keep the <strong>email</strong> and <strong>phone</strong> headers, delete the sample rows, and add one
                person per row. Meta's own customer-list template is accepted as well.
              </span>
            </div>
            <Card
              className="cursor-pointer border-2 border-dashed p-10 text-center hover:bg-muted/30"
              onClick={() => !busy && fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f && !busy) handleFile(f);
              }}
            >
              {busy ? <Loader2 className="mx-auto mb-3 h-10 w-10 animate-spin text-muted-foreground" /> : <Upload className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />}
              <p className="text-sm font-medium">{busy ? busyLabel : "Click or drag a CSV / XLSX file here"}</p>
              <p className="mt-1 text-xs text-muted-foreground">{MIN_AUDIENCE_ROWS} to {MAX_AUDIENCE_ROWS.toLocaleString("en-IN")} rows</p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFile(f);
                }}
              />
            </Card>
            <div className="flex justify-between gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setStep("source")} disabled={busy}>Back</Button>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>Cancel</Button>
            </div>
          </div>
        )}

        {step === "input" && source === "list_view" && (
          <div className="space-y-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Saved views from</Label>
                <Select value={entity} onValueChange={(v) => setEntity(v as AudienceEntity)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {AUDIENCE_LIST_VIEW_ENTITIES.map((k) => (
                      <SelectItem key={k} value={k}>{listViewEntityLabel(k)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Saved view</Label>
                <Select value={viewId} onValueChange={setViewId} disabled={!views.length}>
                  <SelectTrigger><SelectValue placeholder={views.length ? "Select a saved view" : "No saved views for this object"} /></SelectTrigger>
                  <SelectContent>
                    {views.map((v) => (
                      <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {viewId && (
                  <p className="text-xs text-muted-foreground">
                    {viewCount === null ? "Counting rows…" : `${viewCount.toLocaleString("en-IN")} matching ${entity}`}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Rows are read with the view's saved filters. Only their email and phone are used.
            </p>
            <div className="flex justify-between gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setStep("source")} disabled={busy}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>Cancel</Button>
                <Button onClick={handleLoadView} disabled={!viewId || busy} className="gap-2">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} {busy ? busyLabel : "Load rows"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === "review" && (
          <div className="space-y-4 py-2">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Source:</span>
              <span className="font-medium">{originLabel}</span>
              <Badge variant="outline">{stats.total.toLocaleString("en-IN")} rows</Badge>
              <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> {stats.valid.toLocaleString("en-IN")} valid</Badge>
              {stats.invalid > 0 && <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> {stats.invalid} invalid</Badge>}
              {stats.duplicates > 0 && <Badge variant="secondary">{stats.duplicates} duplicates</Badge>}
              {stats.warnings > 0 && <Badge variant="secondary" className="gap-1"><AlertTriangle className="h-3 w-3" /> {stats.warnings} warnings</Badge>}
            </div>

            {(tooFew || tooMany) && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                <span>
                  {tooFew
                    ? `Meta needs at least ${MIN_AUDIENCE_ROWS} valid people in a customer list; this list has ${stats.valid}. Add more rows and upload again.`
                    : `This list has ${stats.valid.toLocaleString("en-IN")} valid people; the limit is ${MAX_AUDIENCE_ROWS.toLocaleString("en-IN")}. Split it into smaller lists.`}
                </span>
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Audience name *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Past facial patients" className="text-base" />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional note shown in Ads Manager" className="text-base" />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(["all", "valid", "invalid"] as FilterMode[]).map((m) => (
                <Button key={m} size="sm" variant={filter === m ? "default" : "outline"} onClick={() => setFilter(m)} className="capitalize">{m}</Button>
              ))}
              {(stats.invalid > 0 || stats.duplicates > 0) && (
                <Button size="sm" variant="ghost" onClick={() => downloadAudienceErrorRows(rows)}>
                  <Download className="mr-2 h-3 w-3" /> Download error rows
                </Button>
              )}
              <span className="ml-auto text-xs text-muted-foreground">Showing first {Math.min(filteredRows.length, PREVIEW_ROWS)} rows</span>
            </div>

            <div className="max-h-[38vh] overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">#</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRows.map((r) => {
                    const hasErr = r.issues.some((x) => x.severity === "error");
                    return (
                      <TableRow key={r.rowNumber}>
                        <TableCell className="text-xs text-muted-foreground">{r.rowNumber}</TableCell>
                        <TableCell className="text-xs">{r.resolved?.email ?? r.raw.email ?? ""}</TableCell>
                        <TableCell className="text-xs font-mono">{r.resolved?.phone ?? r.raw.phone ?? ""}</TableCell>
                        <TableCell className="text-xs">
                          {hasErr
                            ? <span className="text-destructive">{r.issues.map((x) => x.message).join("; ")}</span>
                            : r.issues.length
                              ? <span className="text-warning">{r.issues.map((x) => x.message).join("; ")}</span>
                              : <span className="text-emerald-600">OK</span>}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            <p className="text-xs text-muted-foreground">
              Identifiers are hashed before they reach Meta and are not stored in this app. Only counts are kept.
            </p>

            <div className="flex justify-between gap-2 border-t pt-4">
              <Button variant="outline" onClick={() => setStep("input")} disabled={busy}>Back</Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => handleClose(false)} disabled={busy}>Cancel</Button>
                <Button onClick={handleCreate} disabled={busy || tooFew || tooMany || !name.trim()} className="gap-2">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  {busy ? busyLabel : `Create audience (${stats.valid.toLocaleString("en-IN")} people)`}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
