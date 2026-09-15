import { useState, useRef, useCallback, useEffect, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus, Camera, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { ProcedureFormDialog } from "@/components/procedures/ProcedureFormDialog";
import { ProcedureDetailSheet } from "@/components/procedures/ProcedureDetailSheet";
import { ImportProceduresDialog } from "@/components/procedures/ImportProceduresDialog";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import FieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import ListKanban from "@/components/listViews/ListKanban";
import KanbanSettingsDialog from "@/components/listViews/KanbanSettingsDialog";
import { applyFilters as applyListFilters, fieldDefIn, type ListDisplayMode, type ListView } from "@/lib/listViews/engine";
import { ALL_VIEW_ID, getKanbanConfig, setKanbanConfig } from "@/lib/listViews/standardViews";
import { PROCEDURE_VIEW_FIELDS, DEFAULT_PROCEDURE_VIEW_COLUMNS } from "@/lib/listViews/procedureFields";

// Lazy: pulls in recharts, kept out of the main bundle until a user actually opens Charts.
const ViewChartsPanel = lazy(() => import("@/components/listViews/ViewChartsPanel"));
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { toast } from "sonner";
import { SalesforceSyncButton } from "@/components/salesforce/SalesforceSyncButton";
import { withDrPrefix } from "@/lib/staffName";

const DEFAULT_PROCEDURE_FIELDS = DEFAULT_PROCEDURE_VIEW_COLUMNS;

const toTitleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

// Salesforce-imported procedures rarely have procedures.staff_id set (the
// source object has no doctor field of its own) - fall back to the doctor
// on the procedure's linked appointment, which the import does set.
const getProcedureDoctor = (proc: any) => {
  const s = proc.staff || proc.appointments?.staff;
  const full = s ? [s.first_name, s.last_name].filter(Boolean).join(" ").trim() : "";
  if (full) return withDrPrefix(full);
  // No internal staff match at all - often an external/referring doctor,
  // not one of ours. Show the raw name Salesforce sent rather than nothing.
  const raw: string | undefined = proc.appointments?.reason_for_consultation;
  const m = raw?.match(/\(dr\.?\s*([^)]+)\)/i);
  return m ? withDrPrefix(toTitleCase(m[1].trim())) : "";
};

const Procedures = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  // Seeded from ?q= so global search can hand a term to this list view
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [createOpen, setCreateOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [cameraProc, setCameraProc] = useState<any>(null);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | HTMLDivElement | null>>({});
  const queryClient = useQueryClient();

  const {
    allViews, userId: viewsUserId, activeView, selectView, saveView, saveCharts, deleteView, pinDefault, updateStandardColumns,
  } = useModuleListViews("procedures", "Procedures", DEFAULT_PROCEDURE_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFieldsOpen, setViewFieldsOpen] = useState(false);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);
  const [viewChartsOpen, setViewChartsOpen] = useState(false);
  const [display, setDisplay] = useState<ListDisplayMode>("table");
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [kanban, setKanban] = useState(() => getKanbanConfig("procedures", ALL_VIEW_ID));

  const handleProcedureSaved = useCallback((savedId: string) => {
    setHighlightedId(savedId);
    // Scroll to the row after a short delay to let the sheet close
    setTimeout(() => {
      rowRefs.current[savedId]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
    toast.success("Procedure saved", {
      description: "View Record",
      action: {
        label: "View Record",
        onClick: () => setSelectedId(savedId),
      },
      duration: 6000,
    });
    // Clear highlight after 3 seconds
    setTimeout(() => setHighlightedId(null), 3000);
  }, []);

  const { data: procedures = [], isLoading } = useQuery({
    queryKey: ["procedures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*, patients(first_name, last_name), staff:staff!procedures_staff_id_fkey(first_name, last_name), appointments(staff:staff_id(first_name, last_name), reason_for_consultation)")
        .order("procedure_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role, auth_user_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  // Saved-view filter builder options for the picklist fields
  const viewOptionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "doctor": return staffList.filter((s: any) => s.role === "Doctor").map((s: any) => ({ value: s.id, label: `${s.first_name} ${s.last_name}` }));
      case "status": return ["Pending", "Completed", "Cancelled"].map((s) => ({ value: s, label: s }));
      default: return [];
    }
  };

  const kanbanGroupFields = PROCEDURE_VIEW_FIELDS.filter((f) => f.type === "picklist");
  const kanbanOptions = viewOptionsFor(fieldDefIn(PROCEDURE_VIEW_FIELDS, kanban.group_field)?.optionsSource);

  const moveKanbanCard = async (proc: any, field: string, value: string) => {
    const { error } = await supabase.from("procedures").update({ [field]: value || null } as any).eq("id", proc.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Procedure updated");
    queryClient.invalidateQueries({ queryKey: ["procedures"] });
  };

  useEffect(() => {
    setKanban(getKanbanConfig("procedures", activeView?.id ?? ALL_VIEW_ID));
  }, [activeView?.id]);

  let filtered = procedures.filter((p: any) => {
    const name = `${p.patients?.first_name || ""} ${p.patients?.last_name || ""}`.toLowerCase();
    return name.includes(search.toLowerCase()) || p.service_name?.toLowerCase().includes(search.toLowerCase());
  });

  // Get columns to display based on active saved view or default
  const displayColumns = activeView?.columns?.length ? activeView.columns : DEFAULT_PROCEDURE_FIELDS;

  // Check if a column should be displayed
  const shouldShowColumn = (column: string) => displayColumns.includes(column);

  // Denormalize a procedure into the flat shape PROCEDURE_VIEW_FIELDS' filter
  // engine reads. `doctor` uses the raw staff_id (not the display name) so it
  // matches the picklist options built from staffList.
  const toViewRow = (proc: any) => ({
    id: proc.id,
    procedure_date: proc.procedure_date,
    patient: `${proc.patients?.first_name || ""} ${proc.patients?.last_name || ""}`.trim(),
    service_name: proc.service_name || "",
    doctor: proc.staff_id || "",
    status: proc.status || "",
  });

  // Apply the active saved view's filters (if any)
  const applyViewFilters = (items: any[]) => {
    if (!activeView?.filters?.conditions?.length) return items;
    const denormalized = items.map(toViewRow);
    const kept = new Set(applyListFilters(denormalized, activeView.filters, PROCEDURE_VIEW_FIELDS).map((r) => r.id));
    return items.filter((proc) => kept.has(proc.id));
  };

  // Apply view filters to filtered items
  filtered = applyViewFilters(filtered);

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="page-title">Prescriptions</h1>
          <p className="page-subtitle">Record consultations & prescriptions</p>
        </div>
        <div className="flex gap-2 w-fit flex-wrap">
          <SalesforceSyncButton />
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import Prescriptions
          </Button>
          <Button className="gap-2" onClick={() => navigate("/procedures/new")}>
            <Plus className="h-4 w-4" />
            New Prescription
          </Button>
        </div>
      </div>

      <div className="mb-4 md:mb-6">
        <ViewBar
          views={allViews}
          activeView={activeView}
          currentUserId={viewsUserId}
          onSelect={selectView}
          onNew={() => { setEditingView(null); setViewEditorOpen(true); }}
          onEdit={(v) => { setEditingView(v); setViewEditorOpen(true); }}
          onDelete={(v) => setDeleteViewTarget(v)}
          onPin={pinDefault}
          onClone={(v) => { setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
          onFields={() => setViewFieldsOpen(true)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["procedures"] })}
          display={display}
          onDisplayChange={setDisplay}
          displayModes={["table", "kanban"]}
          onKanbanSettings={() => setKanbanOpen(true)}
          count={filtered.length}
          search={search}
          onSearchChange={setSearch}
          itemLabel="Procedures"
          chartsOpen={viewChartsOpen}
          onToggleCharts={() => { setViewChartsOpen((o) => !o); setViewFiltersOpen(false); }}
          filtersOpen={viewFiltersOpen}
          onToggleFilters={() => { setViewFiltersOpen((o) => !o); setViewChartsOpen(false); }}
        />
      </div>

      {(viewFiltersOpen || viewChartsOpen) && (
        <Sheet open onOpenChange={(o) => { if (!o) { setViewFiltersOpen(false); setViewChartsOpen(false); } }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            {viewFiltersOpen ? (
              <ViewFiltersPanel
                view={activeView}
                canManage={!!activeView && !activeView.is_standard && activeView.owner_id === viewsUserId}
                fields={PROCEDURE_VIEW_FIELDS}
                optionsFor={viewOptionsFor}
                onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
                onClose={() => setViewFiltersOpen(false)}
                itemLabel="procedures"
              />
            ) : activeView && !activeView.is_standard ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading charts…</div>}>
                <ViewChartsPanel
                  charts={activeView.charts ?? []}
                  rows={filtered.map(toViewRow)}
                  canManage={activeView.owner_id === viewsUserId}
                  onChange={(charts) => saveCharts(activeView.id, charts)}
                  onClose={() => setViewChartsOpen(false)}
                  fields={PROCEDURE_VIEW_FIELDS}
                  itemLabel="Procedures"
                  defaultGroupField="status"
                />
              </Suspense>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">
                Charts are available on custom list views. Create or select a custom view to add charts.
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}

      {display === "kanban" ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="data-table">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
          ) : (
            <ListKanban
              rows={filtered}
              config={kanban}
              options={kanbanOptions}
              columns={displayColumns}
              fields={PROCEDURE_VIEW_FIELDS}
              onOpen={(row) => setSelectedId(row.id)}
              onMove={moveKanbanCard}
              titleField="patient"
            />
          )}
        </motion.div>
      ) : (
      <>
      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground text-sm">No procedures found</div>
        ) : (
          filtered.map((proc: any) => (
            <motion.div
              key={proc.id}
              ref={(el) => { rowRefs.current[proc.id] = el; }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`stat-card p-3 cursor-pointer active:scale-[0.98] transition-all duration-500 ${highlightedId === proc.id ? "ring-2 ring-primary bg-primary/5" : ""}`}
              onClick={() => setSelectedId(proc.id)}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-sm">{proc.patients?.first_name} {proc.patients?.last_name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{proc.service_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {getProcedureDoctor(proc) || "—"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <Badge variant="secondary" className="text-xs">{proc.status}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(proc.procedure_date).toLocaleDateString()}</span>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); setCameraProc(proc); }}>
                    <Camera className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="hidden md:block data-table">
        <Table>
          <TableHeader>
            <TableRow>
              {shouldShowColumn("procedure_date") && <TableHead>Date</TableHead>}
              {shouldShowColumn("patient") && <TableHead>Patient</TableHead>}
              {shouldShowColumn("service_name") && <TableHead>Service</TableHead>}
              {shouldShowColumn("doctor") && <TableHead>Doctor</TableHead>}
              {shouldShowColumn("status") && <TableHead>Status</TableHead>}
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">No procedures found</TableCell></TableRow>
            ) : (
              filtered.map((proc: any) => (
                <TableRow key={proc.id} ref={(el) => { rowRefs.current[proc.id] = el; }} className={`cursor-pointer hover:bg-muted/50 transition-all duration-500 ${highlightedId === proc.id ? "ring-2 ring-primary bg-primary/5" : ""}`} onClick={() => setSelectedId(proc.id)}>
                  {shouldShowColumn("procedure_date") && <TableCell className="text-sm">{new Date(proc.procedure_date).toLocaleDateString()}</TableCell>}
                  {shouldShowColumn("patient") && <TableCell className="font-medium">{proc.patients?.first_name} {proc.patients?.last_name}</TableCell>}
                  {shouldShowColumn("service_name") && <TableCell>{proc.service_name}</TableCell>}
                  {shouldShowColumn("doctor") && (
                    <TableCell className="text-sm text-muted-foreground">
                      {getProcedureDoctor(proc) || "—"}
                    </TableCell>
                  )}
                  {shouldShowColumn("status") && (
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">{proc.status}</Badge>
                    </TableCell>
                  )}
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => { e.stopPropagation(); setCameraProc(proc); }} title="Take Photo">
                      <Camera className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </motion.div>
      </>
      )}

      {createOpen && (
        <ProcedureFormDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}

      <ImportProceduresDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => queryClient.invalidateQueries({ queryKey: ["procedures"] })}
      />

      <ProcedureDetailSheet
        procedureId={selectedId}
        onClose={() => {
          setSelectedId(null);
          if (searchParams.get("id")) {
            const next = new URLSearchParams(searchParams);
            next.delete("id");
            setSearchParams(next, { replace: true });
          }
        }}
        onSaved={handleProcedureSaved}
      />

      {cameraProc && (
        <CameraCapture
          open={!!cameraProc}
          onOpenChange={(o) => { if (!o) setCameraProc(null); }}
          patientId={cameraProc.patient_id}
          patientName={`${cameraProc.patients?.first_name || ""} ${cameraProc.patients?.last_name || ""}`}
          context="procedure"
          contextId={cameraProc.id}
        />
      )}

      <KanbanSettingsDialog
        open={kanbanOpen}
        onOpenChange={setKanbanOpen}
        config={kanban}
        groupFields={kanbanGroupFields}
        summaryFields={[]}
        defaultGroupField="status"
        onSave={(cfg) => {
          setKanban(cfg);
          setKanbanConfig("procedures", activeView?.id ?? ALL_VIEW_ID, cfg);
          setDisplay("kanban");
        }}
      />

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={editingView}
        onSave={saveView}
        fields={PROCEDURE_VIEW_FIELDS}
        defaultColumns={DEFAULT_PROCEDURE_VIEW_COLUMNS}
        optionsFor={viewOptionsFor}
        people={staffList
          .filter((s: any) => s.auth_user_id)
          .map((s: any) => ({ value: s.auth_user_id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() }))}
        itemLabel="procedures"
      />

      <FieldsDisplayDialog
        open={viewFieldsOpen}
        onOpenChange={setViewFieldsOpen}
        viewName={activeView?.name ?? "All Procedures"}
        columns={displayColumns}
        onSave={(cols) => {
          if (!activeView) return;
          if (activeView.is_standard) updateStandardColumns(activeView.id, cols);
          else saveView({ ...activeView, columns: cols });
        }}
        fields={PROCEDURE_VIEW_FIELDS}
        defaultColumns={DEFAULT_PROCEDURE_VIEW_COLUMNS}
      />

      <AlertDialog open={!!deleteViewTarget} onOpenChange={(o) => { if (!o) setDeleteViewTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteViewTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This list view will be removed for everyone it is shared with.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                if (deleteViewTarget) deleteView(deleteViewTarget);
                setDeleteViewTarget(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Procedures;
