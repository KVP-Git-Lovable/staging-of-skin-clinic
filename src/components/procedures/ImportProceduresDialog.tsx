import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PROCEDURE_FIELDS,
  ProcedureField,
  FIELD_LABELS,
  parseFile,
  buildMappedProcedureRows,
  toProcedureInsertPayload,
  MappedProcedureRow,
  ResolutionMaps,
  autoDetectProcedureMapping,
  normalizePhone,
  normalizeName,
} from "@/lib/procedureImport";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3 | 4;

export const ImportProceduresDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const [step, setStep] = useState<Step>(1);
  const [parsing, setParsing] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, ProcedureField | "">>({});
  const [mapped, setMapped] = useState<MappedProcedureRow[]>([]);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [defaultDate, setDefaultDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [loadingMaps, setLoadingMaps] = useState(false);

  const reset = () => {
    setStep(1);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setMapped([]);
    setShowOnlyErrors(false);
    setProgress(0);
    setImportedCount(0);
    setSkippedCount(0);
    setDefaultDate(new Date().toISOString().slice(0, 10));
  };

  const handleClose = (o: boolean) => {
    if (!o && !importing) reset();
    onOpenChange(o);
  };

  const handleFile = async (file: File) => {
    setParsing(true);
    try {
      const { headers: h, rows: r } = await parseFile(file);
      if (!h.length || !r.length) {
        toast.error("File is empty or unreadable");
        return;
      }
      setHeaders(h);
      setRows(r);
      setMapping(autoDetectProcedureMapping(h));
      setStep(2);
    } catch (e: any) {
      toast.error(`Failed to parse: ${e.message}`);
    } finally {
      setParsing(false);
    }
  };

  const mappingValid = useMemo(() => {
    const used = new Set(Object.values(mapping).filter(Boolean));
    const hasPatient =
      used.has("patient_sf_id") || used.has("patient_name") || used.has("patient_phone");
    const hasDate = used.has("procedure_date") || !!defaultDate;
    return hasPatient && hasDate;
  }, [mapping, defaultDate]);

  const goToPreview = async () => {
    setLoadingMaps(true);
    try {
      // Page through ALL patients (1000-row Supabase cap) to build sf_id + name + phone maps
      const sfIdToPatient = new Map<string, string>();
      const nameToPatients = new Map<string, string[]>();
      const phoneToPatient = new Map<string, string>();
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("patients")
          .select("id, sf_id, first_name, last_name, phone, created_at")
          .order("created_at", { ascending: false })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const p of data as any[]) {
          if (p.sf_id) sfIdToPatient.set(String(p.sf_id), p.id);
          const key = normalizeName(`${p.first_name || ""} ${p.last_name || ""}`);
          if (key) {
            const arr = nameToPatients.get(key) || [];
            arr.push(p.id);
            nameToPatients.set(key, arr);
          }
          if (p.phone) phoneToPatient.set(normalizePhone(p.phone), p.id);
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }

      // Staff
      const nameToStaff = new Map<string, string>();
      const { data: staffData } = await supabase.from("staff").select("id, first_name, last_name");
      (staffData || []).forEach((s: any) => {
        const full = normalizeName(`${s.first_name || ""} ${s.last_name || ""}`);
        if (full) nameToStaff.set(full, s.id);
        const firstOnly = normalizeName(s.first_name || "");
        if (firstOnly && !nameToStaff.has(firstOnly)) nameToStaff.set(firstOnly, s.id);
      });

      // Services
      const serviceNames = new Map<string, string>();
      const { data: svcData } = await supabase.from("services").select("name");
      (svcData || []).forEach((s: any) => {
        if (s.name) serviceNames.set(normalizeName(s.name), s.name);
      });

      const maps: ResolutionMaps = { sfIdToPatient, nameToPatients, phoneToPatient, nameToStaff, serviceNames };
      const m = buildMappedProcedureRows(rows, mapping, maps, defaultDate || null);
      setMapped(m);
      setStep(3);
    } catch (e: any) {
      toast.error(`Failed to load resolution data: ${e.message}`);
    } finally {
      setLoadingMaps(false);
    }
  };

  const importableRows = mapped.filter((r) => r.errors.length === 0 && !r.skip);
  const errorCount = mapped.filter((r) => r.errors.length > 0).length;
  const warningCount = mapped.filter((r) => r.errors.length === 0 && r.warnings.length > 0).length;

  const handleImport = async () => {
    setImporting(true);
    setStep(4);
    const payloads = importableRows.map((r) => toProcedureInsertPayload(r));
    const batch = 100;
    let inserted = 0;
    let failed = 0;
    let lastError: string | null = null;
    for (let i = 0; i < payloads.length; i += batch) {
      const chunk = payloads.slice(i, i + batch);
      const { error } = await supabase.from("procedures").insert(chunk as any);
      if (error) {
        failed += chunk.length;
        lastError = error.message;
        console.error("Procedure import batch error:", error, "sample row:", chunk[0]);
      } else inserted += chunk.length;
      setProgress(Math.round(((i + chunk.length) / payloads.length) * 100));
    }
    const totalSkipped = errorCount + failed;
    setImportedCount(inserted);
    setSkippedCount(totalSkipped);
    setImporting(false);
    if (inserted > 0) {
      toast.success(`Imported ${inserted} · Skipped ${totalSkipped}`);
    } else {
      toast.error(`Import failed: ${lastError ?? "Unknown error"}`);
    }
    onSuccess();
  };

  const usedFields = new Set(Object.values(mapping).filter(Boolean));
  const previewRows = mapped.filter((r) => !r.skip);
  const visibleRows = showOnlyErrors ? previewRows.filter((r) => r.errors.length) : previewRows;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Procedures</DialogTitle>
          <DialogDescription>
            Step {step} of 4 · {step === 1 ? "Upload file" : step === 2 ? "Map columns" : step === 3 ? "Preview & validate" : "Import"}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {step === 1 && (
            <div className="py-8">
              <label className="border-2 border-dashed rounded-lg p-12 flex flex-col items-center justify-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors">
                <Upload className="h-10 w-10 text-muted-foreground" />
                <div className="text-center">
                  <p className="font-medium">Click to upload Excel or CSV file</p>
                  <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv supported</p>
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                  }}
                />
                {parsing && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Map each file column to a procedure field. Required: at least one patient identifier (Salesforce ID, Name, or Phone) and a date (column or default below).
              </p>
              {!Object.values(mapping).includes("procedure_date") && (
                <div className="flex items-center gap-3 bg-muted/40 border rounded-lg p-3">
                  <Label htmlFor="default-date" className="text-sm whitespace-nowrap">Default procedure date</Label>
                  <Input
                    id="default-date"
                    type="date"
                    value={defaultDate}
                    onChange={(e) => setDefaultDate(e.target.value)}
                    className="h-8 w-48"
                  />
                  <span className="text-xs text-muted-foreground">Applied to all rows (no date column mapped)</span>
                </div>
              )}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">File Column</th>
                      <th className="text-left p-3 font-medium">Procedure Field</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {headers.map((h) => (
                      <tr key={h}>
                        <td className="p-3 font-mono text-xs">{h}</td>
                        <td className="p-3">
                          <Select
                            value={mapping[h] || "__skip__"}
                            onValueChange={(v) =>
                              setMapping((prev) => ({ ...prev, [h]: v === "__skip__" ? "" : (v as ProcedureField) }))
                            }
                          >
                            <SelectTrigger className="h-8 w-64">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__">— Skip —</SelectItem>
                              {PROCEDURE_FIELDS.map((f) => (
                                <SelectItem key={f} value={f} disabled={usedFields.has(f) && mapping[h] !== f}>
                                  {FIELD_LABELS[f]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1.5"><CheckCircle2 className="h-4 w-4 text-success" /> {importableRows.length} valid</span>
                  <span className="flex items-center gap-1.5"><AlertCircle className="h-4 w-4 text-destructive" /> {errorCount} errors</span>
                  {warningCount > 0 && (
                    <span className="text-muted-foreground">{warningCount} with warnings</span>
                  )}
                  <span className="text-muted-foreground">Total: {mapped.length}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="errs-only" className="text-xs">Errors only</Label>
                  <Switch id="errs-only" checked={showOnlyErrors} onCheckedChange={setShowOnlyErrors} />
                </div>
              </div>
              <div className="border rounded-lg overflow-auto max-h-[50vh]">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2">Row</th>
                      <th className="text-left p-2">Status</th>
                      {Array.from(usedFields).map((f) => (
                        <th key={f} className="text-left p-2 whitespace-nowrap">{f}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleRows.slice(0, 100).map((r) => (
                      <tr key={r.index} className={r.errors.length ? "bg-destructive/5" : ""}>
                        <td className="p-2">{r.index + 1}</td>
                        <td className="p-2">
                          {r.errors.length ? (
                            <span className="text-destructive">{r.errors.join("; ")}</span>
                          ) : r.warnings.length ? (
                            <span className="text-warning">OK · {r.warnings.join("; ")}</span>
                          ) : (
                            <span className="text-success">OK</span>
                          )}
                        </td>
                        {Array.from(usedFields).map((f) => (
                          <td key={f} className="p-2 whitespace-nowrap max-w-[180px] truncate">
                            {r.data[f] !== undefined ? String(r.data[f]) : ""}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {visibleRows.length > 100 && (
                  <div className="p-3 text-center text-xs text-muted-foreground border-t">
                    Showing first 100 of {visibleRows.length} rows
                  </div>
                )}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <FileSpreadsheet className="h-12 w-12 text-primary" />
              </div>
              <Progress value={progress} />
              <p className="text-center text-sm text-muted-foreground">
                {importing ? `Importing... ${progress}%` : `Imported ${importedCount} · Skipped ${skippedCount}`}
              </p>
            </div>
          )}
        </div>

        <div className="flex justify-between pt-4 border-t">
          <Button variant="outline" onClick={() => handleClose(false)} disabled={importing}>
            {step === 4 && !importing ? "Close" : "Cancel"}
          </Button>
          <div className="flex gap-2">
            {step === 2 && (
              <>
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={goToPreview} disabled={!mappingValid || loadingMaps}>
                  {loadingMaps && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Preview {!mappingValid && "(map a patient field & date)"}
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={handleImport} disabled={importableRows.length === 0}>
                  Import {importableRows.length} valid procedure{importableRows.length !== 1 ? "s" : ""}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};