import { useState, useRef, useCallback, useEffect, useMemo, lazy, Suspense } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ViewPrescriptionButton } from "@/components/prescriptions/ViewPrescriptionButton";
import { ProcedureFormDialog } from "@/components/procedures/ProcedureFormDialog";
import { ProcedureDetailSheet } from "@/components/procedures/ProcedureDetailSheet";
import { useUrlPanel } from "@/hooks/useUrlPanel";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import FieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import { getReportDateRange } from "@/lib/reportDateRange";
import { withinRange } from "@/lib/listDateFilter";
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
import { withDrPrefix } from "@/lib/staffName";
import { procedureDateLabel } from "@/lib/procedureDate";

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

  // A period to look at, offered in the Filters panel. It belongs to the page
  // rather than to the view, so it works on the standard views too - whose
  // own filters are locked, which is why there was no way to ask for one
  // day's visits at all. "all" is every visit, as before.
  const [datePreset, setDatePreset] = useState("all");
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const dateRange = useMemo(
    () => getReportDateRange(datePreset, dateStart, dateEnd),
    [datePreset, dateStart, dateEnd],
  );
  const [createOpen, setCreateOpen] = useState(false);
  // Two-way now. It was seeded from ?id= but never wrote back, so opening a
  // record left no history entry and Back walked out of the list.
  const { openId: selectedId, open: openProcedure, close: closeProcedure } = useUrlPanel("id");
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | HTMLDivElement | null>>({});
  const queryClient = useQueryClient();

  // "procedures" is the section key - it names the saved views in the database
  // and the column layouts in the browser, so it stays. Only the label, which
  // the dropdown prints as "All Prescriptions", follows the module's name.
  const {
    allViews, userId: viewsUserId, activeView, selectView, saveView, saveCharts, deleteView, pinDefault, unpinDefault, updateStandardColumns,
  } = useModuleListViews("procedures", "Prescriptions", DEFAULT_PROCEDURE_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFieldsOpen, setViewFieldsOpen] = useState(false);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);
  const [viewChartsOpen, setViewChartsOpen] = useState(false);
  const [display, setDisplay] = useState<ListDisplayMode>("table");
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [kanban, setKanban] = useState(() => getKanbanConfig("procedures", ALL_VIEW_ID));

  // Marks the row so it is easy to find once the visit is closed. The visit
  // itself no longer closes on save, so there is nothing to scroll to yet and
  // nothing to offer a way back into - it says "Prescription saved" where the
  // doctor is looking, which is inside the visit.
  const handleProcedureSaved = useCallback((savedId: string) => {
    setHighlightedId(savedId);
    setTimeout(() => setHighlightedId(null), 3000);
  }, []);

  const { data: procedures = [], isLoading } = useQuery({
    queryKey: ["procedures"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("procedures")
        .select("*, patients(first_name, last_name), staff:staff!procedures_staff_id_fkey(first_name, last_name), appointments(staff:staff_id(first_name, last_name), reason_for_consultation)")
        // Visits imported without a date are left out: the clinic wants the
        // record to match Salesforce exactly, nothing more. The rows are still
        // in the database - see the 20260925 migration - just not listed.
        .eq("date_not_recorded", false)
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
    toast.success("Prescription updated");
    queryClient.invalidateQueries({ queryKey: ["procedures"] });
  };

  useEffect(() => {
    setKanban(getKanbanConfig("procedures", activeView?.id ?? ALL_VIEW_ID));
  }, [activeView?.id]);

  let filtered = procedures.filter((p: any) => {
    if (!withinRange(p.procedure_date, dateRange)) return false;
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
    // Carried so the list/kanban path can tell an undated visit from one on
    // 1 January 1900 - formatCell reads the whole row.
    date_not_recorded: proc.date_not_recorded,
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
          onUnpin={unpinDefault}
          onClone={(v) => { setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
          onFields={() => setViewFieldsOpen(true)}
          onRefresh={() => queryClient.invalidateQueries({ queryKey: ["procedures"] })}
          display={display}
          onDisplayChange={setDisplay}
          displayModes={["table", "kanban"]}
          onKanbanSettings={() => setKanbanOpen(true)}
          count={filtered.length}
          countLoading={isLoading}
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
                dateFilter={{
                  preset: datePreset,
                  customStart: dateStart,
                  customEnd: dateEnd,
                  label: "Visit date",
                  onChange: ({ preset, customStart, customEnd }) => {
                    setDatePreset(preset);
                    setDateStart(customStart);
                    setDateEnd(customEnd);
                  },
                }}
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
                  // A chart grouped by a picklist shows the names behind the
                  // ids the column stores - the doctor field holds a staff id.
                  optionsFor={viewOptionsFor}
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
              onOpen={(row) => openProcedure(row.id)}
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
          <div className="text-center py-8 text-muted-foreground text-sm">No prescriptions found</div>
        ) : (
          filtered.map((proc: any) => (
            <motion.div
              key={proc.id}
              ref={(el) => { rowRefs.current[proc.id] = el; }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`stat-card p-3 cursor-pointer active:scale-[0.98] transition-all duration-500 ${highlightedId === proc.id ? "ring-2 ring-primary bg-primary/5" : ""}`}
              onClick={() => openProcedure(proc.id)}
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
                  <span className="text-xs text-muted-foreground">{procedureDateLabel(proc, "dd/MM/yyyy")}</span>
                  {/* Reading or printing a prescription should not mean
                      opening it - opening it is one slip away from changing
                      what was saved. */}
                  <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                    <ViewPrescriptionButton procedureId={proc.id} className="h-7 w-7" />
                    <ViewPrescriptionButton procedureId={proc.id} action="print" className="h-7 w-7" />
                  </div>
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
              <TableHead className="w-24"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : filtered.length === 0 ? (
              <TableRow><TableCell colSpan={displayColumns.length + 1} className="text-center py-8 text-muted-foreground">No prescriptions found</TableCell></TableRow>
            ) : (
              filtered.map((proc: any) => (
                <TableRow key={proc.id} ref={(el) => { rowRefs.current[proc.id] = el; }} className={`cursor-pointer hover:bg-muted/50 transition-all duration-500 ${highlightedId === proc.id ? "ring-2 ring-primary bg-primary/5" : ""}`} onClick={() => openProcedure(proc.id)}>
                  {shouldShowColumn("procedure_date") && <TableCell className="text-sm">{procedureDateLabel(proc, "dd/MM/yyyy")}</TableCell>}
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
                  {/* Stopped once on the cell rather than per button, as the
                      invoice table does. */}
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <div className="flex justify-end gap-1">
                      <ViewPrescriptionButton procedureId={proc.id} />
                      <ViewPrescriptionButton procedureId={proc.id} action="print" />
                    </div>
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

      <ProcedureDetailSheet
        procedureId={selectedId}
        onClose={closeProcedure}
        onSaved={handleProcedureSaved}
      />

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
        viewName={activeView?.name ?? "All Prescriptions"}
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
