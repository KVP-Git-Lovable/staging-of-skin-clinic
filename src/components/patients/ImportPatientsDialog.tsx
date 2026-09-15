import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Download } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  PATIENT_FIELDS,
  REQUIRED_FIELDS,
  PatientField,
  parseFile,
  buildMappedRows,
  toInsertPayload,
  MappedRow,
  MappingTarget,
  FULL_NAME_TARGET,
  autoDetectMapping,
} from "@/lib/patientImport";

const FIELD_LABELS: Record<PatientField, string> = {
  first_name: "First Name",
  last_name: "Last Name",
  phone: "Phone",
  email: "Email",
  date_of_birth: "Date of Birth",
  gender: "Gender",
  address: "Address",
  emergency_contact_name: "Emergency Contact Name",
  emergency_contact_phone: "Emergency Contact Phone",
  source: "Source",
  medical_history: "Medical History",
  previous_treatments: "Previous Treatments",
  notes: "Notes",
  skin_concerns: "Skin Concerns",
  follows_facebook: "Follows Facebook",
  follows_instagram: "Follows Instagram",
  sf_id: "Salesforce ID",
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSuccess: () => void;
}

type Step = 1 | 2 | 3 | 4;

export const ImportPatientsDialog = ({ open, onOpenChange, onSuccess }: Props) => {
  const [step, setStep] = useState<Step>(1);
  const [parsing, setParsing] = useState(false);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, MappingTarget | "">>({});
  const [mapped, setMapped] = useState<MappedRow[]>([]);
  const [showOnlyErrors, setShowOnlyErrors] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const [reportRows, setReportRows] = useState<Array<{ row: number; status: string; reason: string; phone: string; email: string; name: string }>>([]);
  const [updateMode, setUpdateMode] = useState(false);
  // phone -> patient row (id + current values), used when updateMode is on
  const [phoneToPatient, setPhoneToPatient] = useState<Map<string, any>>(new Map());

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
    setReportRows([]);
    setUpdateMode(false);
    setPhoneToPatient(new Map());
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
      setMapping(autoDetectMapping(h));
      setStep(2);
    } catch (e: any) {
      toast.error(`Failed to parse: ${e.message}`);
    } finally {
      setParsing(false);
    }
  };

  const mappingValid = useMemo(() => {
    const used = new Set(Object.values(mapping).filter(Boolean));
    const hasFullName = used.has(FULL_NAME_TARGET);
    return REQUIRED_FIELDS.every((f) => used.has(f) || (f === "first_name" && hasFullName));
  }, [mapping]);

  const goToPreview = async () => {
    setLoadingExisting(true);
    try {
      // Paginated fetch of ALL existing patients (phone + email) to handle 1000-row cap
      const existingPhones = new Set<string>();
      const existingEmails = new Set<string>();
      const phoneMap = new Map<string, any>();
      const PAGE = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await supabase
          .from("patients")
          .select("id,phone,email,sf_id,first_name,last_name,date_of_birth,gender,address,email,emergency_contact_name,emergency_contact_phone,source,medical_history,previous_treatments,notes,skin_concerns,follows_facebook,follows_instagram")
          .range(from, from + PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        for (const r of data) {
          if (r.phone) {
            const p = String(r.phone).replace(/[\s\-()]/g, "").trim();
            existingPhones.add(p);
            if (!phoneMap.has(p)) phoneMap.set(p, r);
          }
          if (r.email) existingEmails.add(String(r.email).trim().toLowerCase());
        }
        if (data.length < PAGE) break;
        from += PAGE;
      }
      // In update mode, do NOT treat phone matches as duplicates — they become updates
      const m = buildMappedRows(
        rows,
        mapping,
        updateMode ? new Set() : existingPhones,
        updateMode ? new Set() : existingEmails
      );
      setPhoneToPatient(phoneMap);
      setMapped(m);
      setStep(3);
    } catch (e: any) {
      toast.error(`Failed to load existing patients: ${e.message}`);
    } finally {
      setLoadingExisting(false);
    }
  };

  const importableRows = mapped.filter((r) => r.errors.length === 0 && !r.skip);
  const dupDbCount = mapped.filter((r) => r.skip && r.skipReason?.includes("in DB")).length;
  const dupFileCount = mapped.filter((r) => r.skip && r.skipReason?.includes("in file")).length;
  const errorCount = mapped.filter((r) => r.errors.length > 0).length;

  const handleImport = async () => {
    setImporting(true);
    setStep(4);
    const batch = 100;
    let inserted = 0;
    let updated = 0;
    let failed = 0;
    const report: typeof reportRows = [];

    // Split rows into "update existing" vs "insert new" when updateMode is on
    const toInsert: Array<{ row: number; data: any; payload: any }> = [];
    const toUpdate: Array<{ row: number; data: any; id: string; patch: any }> = [];
    for (const r of importableRows) {
      const phone = r.data.phone ? String(r.data.phone) : "";
      const existing = updateMode && phone ? phoneToPatient.get(phone) : null;
      if (existing) {
        // Build patch: only fill columns that are currently empty in DB
        const patch: Record<string, any> = {};
        for (const [k, v] of Object.entries(r.data)) {
          if (v === undefined || v === null || v === "") continue;
          const cur = (existing as any)[k];
          if (cur === null || cur === undefined || cur === "") {
            patch[k] = v;
          }
        }
        if (Object.keys(patch).length > 0) {
          toUpdate.push({ row: r.index + 1, data: r.data, id: existing.id, patch });
        } else {
          report.push({ row: r.index + 1, status: "skipped", reason: "no empty fields to fill", phone, email: r.data.email || "", name: `${r.data.first_name || ""} ${r.data.last_name || ""}`.trim() });
        }
      } else {
        toInsert.push({ row: r.index + 1, data: r.data, payload: toInsertPayload(r) });
      }
    }

    // Pre-fill skip/error reasons in report
    for (const r of mapped) {
      if (r.skip) report.push({ row: r.index + 1, status: "skipped", reason: r.skipReason || "duplicate", phone: r.data.phone || "", email: r.data.email || "", name: `${r.data.first_name || ""} ${r.data.last_name || ""}`.trim() });
      else if (r.errors.length) report.push({ row: r.index + 1, status: "invalid", reason: r.errors.join("; "), phone: r.data.phone || "", email: r.data.email || "", name: `${r.data.first_name || ""} ${r.data.last_name || ""}`.trim() });
    }

    const totalOps = toInsert.length + toUpdate.length;
    let done = 0;

    // INSERTS (batched)
    for (let i = 0; i < toInsert.length; i += batch) {
      const chunk = toInsert.slice(i, i + batch);
      const { error } = await supabase.from("patients").insert(chunk.map((c) => c.payload) as any);
      if (error) {
        for (const c of chunk) {
          const { error: e2 } = await supabase.from("patients").insert(c.payload as any);
          if (e2) {
            failed++;
            report.push({ row: c.row, status: "failed", reason: e2.message, phone: c.data.phone || "", email: c.data.email || "", name: `${c.data.first_name || ""} ${c.data.last_name || ""}`.trim() });
          } else {
            inserted++;
            report.push({ row: c.row, status: "imported", reason: "", phone: c.data.phone || "", email: c.data.email || "", name: `${c.data.first_name || ""} ${c.data.last_name || ""}`.trim() });
          }
        }
      } else {
        inserted += chunk.length;
        for (const c of chunk) report.push({ row: c.row, status: "imported", reason: "", phone: c.data.phone || "", email: c.data.email || "", name: `${c.data.first_name || ""} ${c.data.last_name || ""}`.trim() });
      }
      done += chunk.length;
      if (totalOps) setProgress(Math.round((done / totalOps) * 100));
    }

    // UPDATES (per-row, since each has its own patch)
    for (const u of toUpdate) {
      const { error } = await supabase.from("patients").update(u.patch).eq("id", u.id);
      if (error) {
        failed++;
        report.push({ row: u.row, status: "failed", reason: error.message, phone: u.data.phone || "", email: u.data.email || "", name: `${u.data.first_name || ""} ${u.data.last_name || ""}`.trim() });
      } else {
        updated++;
        report.push({ row: u.row, status: "updated", reason: `filled: ${Object.keys(u.patch).join(", ")}`, phone: u.data.phone || "", email: u.data.email || "", name: `${u.data.first_name || ""} ${u.data.last_name || ""}`.trim() });
      }
      done++;
      if (totalOps) setProgress(Math.round((done / totalOps) * 100));
    }

    const totalSkipped = errorCount + dupDbCount + dupFileCount + failed;
    setImportedCount(inserted + updated);
    setSkippedCount(totalSkipped);
    setReportRows(report);
    setImporting(false);
    if (inserted + updated > 0) {
      toast.success(`Inserted ${inserted} · Updated ${updated} · Skipped ${totalSkipped}`);
    } else if (failed > 0) {
      toast.error(`Import failed for all rows`);
    } else {
      toast.info(`No new patients to import`);
    }
    onSuccess();
  };

  const downloadReport = () => {
    const header = ["row", "name", "phone", "email", "status", "reason"];
    const csv = [header.join(",")]
      .concat(reportRows.map((r) => header.map((h) => {
        const v = String((r as any)[h] ?? "");
        return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
      }).join(",")))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient_import_report_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const usedFields = new Set(Object.values(mapping).filter(Boolean));
  // For preview display: replace virtual __full_name__ with the real split fields
  const displayFields = useMemo(() => {
    const fields: (PatientField | MappingTarget)[] = [];
    const seen = new Set<string>();
    const push = (f: PatientField | MappingTarget) => {
      if (!seen.has(f)) { seen.add(f); fields.push(f); }
    };
    for (const f of usedFields) {
      if (f === FULL_NAME_TARGET) {
        push("first_name");
        push("last_name");
      } else {
        push(f as PatientField);
      }
    }
    return fields;
  }, [mapping]);
  const previewRows = mapped.filter((r) => !r.skip);
  const visibleRows = showOnlyErrors ? previewRows.filter((r) => r.errors.length) : previewRows;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Import Patients</DialogTitle>
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
                Map each file column to a patient field. Required: First Name, Phone.
              </p>
              <div className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="update-mode" className="text-sm font-medium">Update existing patients (match by phone)</Label>
                  <p className="text-xs text-muted-foreground">
                    Fill empty fields (like Salesforce ID) on existing records instead of skipping them. New patients are still inserted. No data is overwritten.
                  </p>
                </div>
                <Switch id="update-mode" checked={updateMode} onCheckedChange={setUpdateMode} />
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3 font-medium">File Column</th>
                      <th className="text-left p-3 font-medium">Patient Field</th>
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
                              setMapping((prev) => ({ ...prev, [h]: v === "__skip__" ? "" : (v as MappingTarget) }))
                            }
                          >
                            <SelectTrigger className="h-8 w-64">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__skip__">— Skip —</SelectItem>
                              <SelectItem
                                value={FULL_NAME_TARGET}
                                disabled={usedFields.has(FULL_NAME_TARGET) && mapping[h] !== FULL_NAME_TARGET}
                              >
                                Full Name (auto-split) *
                              </SelectItem>
                              {PATIENT_FIELDS.map((f) => (
                                <SelectItem key={f} value={f} disabled={usedFields.has(f) && mapping[h] !== f}>
                                  {FIELD_LABELS[f]}
                                  {REQUIRED_FIELDS.includes(f) && " *"}
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
                  {dupDbCount > 0 && (
                    <span className="text-muted-foreground">{dupDbCount} duplicates in DB</span>
                  )}
                  {dupFileCount > 0 && (
                    <span className="text-muted-foreground">{dupFileCount} duplicates in file</span>
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
                      {displayFields.map((f) => (
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
                          ) : (
                            <span className="text-success">OK</span>
                          )}
                        </td>
                        {displayFields.map((f) => (
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
              {!importing && reportRows.length > 0 && (
                <div className="flex justify-center">
                  <Button variant="outline" size="sm" onClick={downloadReport}>
                    <Download className="h-4 w-4 mr-2" /> Download report
                  </Button>
                </div>
              )}
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
                <Button onClick={goToPreview} disabled={!mappingValid || loadingExisting}>
                  {loadingExisting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Preview {!mappingValid && "(map required fields)"}
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={handleImport} disabled={importableRows.length === 0}>
                  Import {importableRows.length} valid patient{importableRows.length !== 1 ? "s" : ""}
                </Button>
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};