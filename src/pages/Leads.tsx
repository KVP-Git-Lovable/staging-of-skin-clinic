import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Loader2, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import FieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import ListKanban from "@/components/listViews/ListKanban";
import ListViewTable, { type SortDir } from "@/components/listViews/ListViewTable";
import KanbanSettingsDialog from "@/components/listViews/KanbanSettingsDialog";
import { LeadFormSheet, type LeadRow } from "@/components/leads/LeadFormSheet";
import { ImportLeadsDialog } from "@/components/leads/ImportLeadsDialog";
import { PatientFormSheet } from "@/components/patients/PatientFormSheet";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { applyFilters as applyListFilters, fieldDefIn, sortRows, type ListDisplayMode, type ListView } from "@/lib/listViews/engine";
import { ALL_VIEW_ID, getKanbanConfig, setKanbanConfig } from "@/lib/listViews/standardViews";
import { DEFAULT_LEAD_VIEW_COLUMNS, LEAD_SOURCES, LEAD_STATUSES, LEAD_VIEW_FIELDS } from "@/lib/listViews/leadFields";

// Lazy: pulls in recharts, kept out of the main bundle until a user opens Charts.
const ViewChartsPanel = lazy(() => import("@/components/listViews/ViewChartsPanel"));

const PAGE_SIZE = 50;
const statusLabel = (v: string) => LEAD_STATUSES.find((s) => s.value === v)?.label ?? v;
const statusClass: Record<string, string> = {
  new: "bg-info/10 text-info",
  contacted: "bg-warning/10 text-warning",
  qualified: "bg-primary/10 text-primary",
  appointment_booked: "bg-success/10 text-success",
  converted: "bg-success/10 text-success",
  lost: "bg-muted text-muted-foreground",
};
const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

export default function Leads() {
  const qc = useQueryClient();
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [sheetLead, setSheetLead] = useState<LeadRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [convertLead, setConvertLead] = useState<LeadRow | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { allViews, userId: viewsUserId, activeView, selectView, saveView, saveCharts, deleteView, pinDefault, unpinDefault, updateStandardColumns } =
    useModuleListViews("leads", "Leads", DEFAULT_LEAD_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFieldsOpen, setViewFieldsOpen] = useState(false);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);
  const [viewChartsOpen, setViewChartsOpen] = useState(false);
  const [display, setDisplay] = useState<ListDisplayMode>("table");
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [kanban, setKanban] = useState(() => getKanbanConfig("leads", ALL_VIEW_ID));

  useEffect(() => {
    setKanban(getKanbanConfig("leads", activeView?.id ?? ALL_VIEW_ID));
  }, [activeView?.id]);

  const { data: leads = [], isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as LeadRow[];
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["leads-staff-all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, auth_user_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data || [];
    },
  });
  const staffName = useMemo(() => new Map(staffList.map((s) => [s.id, `${s.first_name} ${s.last_name || ""}`.trim()])), [staffList]);

  const optionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "status": return LEAD_STATUSES;
      case "source": return LEAD_SOURCES.map((s) => ({ value: s, label: s }));
      case "owner": return staffList.map((s) => ({ value: s.id, label: staffName.get(s.id) || "" }));
      default: return [];
    }
  };

  const displayColumns = activeView?.columns?.length ? activeView.columns : DEFAULT_LEAD_VIEW_COLUMNS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = leads.filter((l) => !q || [l.name, l.phone, l.email, l.city, l.interest].some((v) => (v ?? "").toLowerCase().includes(q)));
    if (activeView?.filters?.conditions?.length) {
      const kept = new Set(applyListFilters(rows as unknown as Record<string, unknown>[], activeView.filters, LEAD_VIEW_FIELDS).map((r) => r.id as string));
      rows = rows.filter((l) => kept.has(l.id));
    }
    return sortKey ? (sortRows(rows, sortKey, sortDir, LEAD_VIEW_FIELDS) as LeadRow[]) : rows;
  }, [leads, search, activeView, sortKey, sortDir]);

  useEffect(() => setPage(1), [search, activeView?.id, display]);
  const paged = display === "table" ? filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) : filtered;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const refresh = () => qc.invalidateQueries({ queryKey: ["leads"] });

  const updateLead = async (id: string, patch: TablesUpdate<"leads">) => {
    const { error } = await supabase.from("leads").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else refresh();
  };

  const toggleOne = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () =>
    setSelectedIds((prev) => (paged.every((r) => prev.has(r.id)) ? new Set() : new Set(paged.map((r) => r.id))));

  const deleteSelected = async () => {
    const { error } = await supabase.from("leads").delete().in("id", Array.from(selectedIds));
    setDeleteOpen(false);
    if (error) return toast.error(error.message);
    toast.success(`Deleted ${selectedIds.size} lead${selectedIds.size === 1 ? "" : "s"}`);
    setSelectedIds(new Set());
    refresh();
  };

  // After the patient form saves, find the new patient by phone and link it to the lead.
  const markConverted = async () => {
    const lead = convertLead;
    setConvertLead(null);
    if (!lead) return;
    const { data } = await supabase.from("patients").select("id, phone, created_at").ilike("phone", `%${last10(lead.phone)}`).order("created_at", { ascending: false }).limit(5);
    const match = (data || []).find((p) => last10(p.phone || "") === last10(lead.phone));
    await updateLead(lead.id, { status: "converted", converted_patient_id: match?.id ?? null });
    toast.success(match ? "Lead converted to a patient" : "Patient saved. The lead was marked converted");
  };

  const [firstName, ...restName] = (convertLead?.name ?? "").split(" ");
  const kanbanGroupFields = LEAD_VIEW_FIELDS.filter((f) => f.type === "picklist");
  const kanbanOptions = optionsFor(fieldDefIn(LEAD_VIEW_FIELDS, kanban.group_field)?.optionsSource);

  return (
    <div>
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between md:gap-4">
        <div>
          <h1 className="page-title">Leads</h1>
          <p className="page-subtitle">People who have shown interest but are not patients yet</p>
        </div>
        <div className="flex w-fit flex-wrap gap-2">
          {selectedIds.size > 0 && (
            <Button variant="destructive" className="gap-2" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete ({selectedIds.size})
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" /> Import Leads
          </Button>
          <Button className="gap-2" onClick={() => { setSheetLead(null); setSheetOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Lead
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
          onClone={(v) => { setEditingView({ ...v, id: undefined as unknown as string, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
          onFields={() => setViewFieldsOpen(true)}
          onRefresh={refresh}
          display={display}
          onDisplayChange={setDisplay}
          displayModes={["table", "kanban"]}
          onKanbanSettings={() => setKanbanOpen(true)}
          count={filtered.length}
          search={search}
          onSearchChange={setSearch}
          itemLabel="Leads"
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
                fields={LEAD_VIEW_FIELDS}
                optionsFor={optionsFor}
                onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
                onClose={() => setViewFiltersOpen(false)}
                itemLabel="leads"
              />
            ) : activeView && !activeView.is_standard ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading charts…</div>}>
                <ViewChartsPanel
                  charts={activeView.charts ?? []}
                  rows={filtered as unknown as Record<string, unknown>[]}
                  canManage={activeView.owner_id === viewsUserId}
                  onChange={(charts) => saveCharts(activeView.id, charts)}
                  onClose={() => setViewChartsOpen(false)}
                  fields={LEAD_VIEW_FIELDS}
                  itemLabel="Leads"
                  defaultGroupField="status"
                />
              </Suspense>
            ) : (
              <div className="p-4 text-sm text-muted-foreground">Charts are available on custom list views. Create or select a custom view to add charts.</div>
            )}
          </SheetContent>
        </Sheet>
      )}

      {display === "kanban" ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="data-table">
          {isLoading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading...</div>
          ) : (
            <ListKanban
              rows={filtered}
              config={kanban}
              options={kanbanOptions}
              columns={displayColumns}
              fields={LEAD_VIEW_FIELDS}
              onOpen={(row: LeadRow) => { setSheetLead(row); setSheetOpen(true); }}
              onMove={(row: LeadRow, field: string, value: string) => updateLead(row.id, { [field]: value || null } as TablesUpdate<"leads">)}
              titleField="name"
            />
          )}
        </motion.div>
      ) : (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="data-table">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading...</div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {leads.length === 0 ? "No leads yet. Add one, import a file, or fetch leads from a Meta lead ad." : "No leads match this view."}
            </div>
          ) : (
            <ListViewTable
              rows={paged}
              columns={displayColumns}
              fields={LEAD_VIEW_FIELDS}
              selectedIds={selectedIds}
              onToggle={toggleOne}
              onToggleAll={toggleAll}
              onOpen={(row: LeadRow) => { setSheetLead(row); setSheetOpen(true); }}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={(key) => {
                if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                else { setSortKey(key); setSortDir("asc"); }
              }}
              onInlineSave={(row: LeadRow, key, value) => updateLead(row.id, { [key]: value || null } as TablesUpdate<"leads">)}
              picklistOptions={{ status: LEAD_STATUSES, source: optionsFor("source"), owner_id: optionsFor("owner") }}
              readOnlyKeys={["created_at", "updated_at"]}
              renderCell={(row: LeadRow, key, value) => {
                if (key === "status") return <Badge className={statusClass[row.status] ?? ""}>{statusLabel(row.status)}</Badge>;
                if (key === "owner_id") return <span className="text-sm">{row.owner_id ? staffName.get(row.owner_id) ?? "—" : "Unassigned"}</span>;
                if (key === "name") return <span className="font-medium">{value}</span>;
                return undefined;
              }}
            />
          )}
          {display === "table" && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t p-3 text-sm text-muted-foreground">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}</span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <span>Page {page} of {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </motion.div>
      )}

      <LeadFormSheet open={sheetOpen} onOpenChange={setSheetOpen} lead={sheetLead} onSaved={refresh} onConvert={(l) => { setSheetOpen(false); setConvertLead(l); }} />
      <ImportLeadsDialog open={importOpen} onOpenChange={setImportOpen} onDone={refresh} />

      {convertLead && (
        <PatientFormSheet
          open
          onOpenChange={(o) => { if (!o) setConvertLead(null); }}
          defaultValues={{ first_name: firstName, last_name: restName.join(" "), phone: convertLead.phone, email: convertLead.email }}
          onSuccess={markConverted}
        />
      )}

      <KanbanSettingsDialog
        open={kanbanOpen}
        onOpenChange={setKanbanOpen}
        config={kanban}
        groupFields={kanbanGroupFields}
        summaryFields={[]}
        defaultGroupField="status"
        onSave={(cfg) => { setKanban(cfg); setKanbanConfig("leads", activeView?.id ?? ALL_VIEW_ID, cfg); setDisplay("kanban"); }}
      />

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={editingView}
        onSave={saveView}
        fields={LEAD_VIEW_FIELDS}
        defaultColumns={DEFAULT_LEAD_VIEW_COLUMNS}
        optionsFor={optionsFor}
        people={staffList.filter((s) => s.auth_user_id).map((s) => ({ value: s.auth_user_id as string, label: staffName.get(s.id) || "" }))}
        itemLabel="leads"
      />

      <FieldsDisplayDialog
        open={viewFieldsOpen}
        onOpenChange={setViewFieldsOpen}
        viewName={activeView?.name ?? "All Leads"}
        columns={displayColumns}
        onSave={(cols) => {
          if (!activeView) return;
          if (activeView.is_standard) updateStandardColumns(activeView.id, cols);
          else saveView({ ...activeView, columns: cols });
        }}
        fields={LEAD_VIEW_FIELDS}
        defaultColumns={DEFAULT_LEAD_VIEW_COLUMNS}
      />

      <AlertDialog open={!!deleteViewTarget} onOpenChange={(o) => { if (!o) setDeleteViewTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteViewTarget?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This list view will be removed for everyone it is shared with.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); if (deleteViewTarget) deleteView(deleteViewTarget); setDeleteViewTarget(null); }}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes them. Converted patients are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={(e) => { e.preventDefault(); deleteSelected(); }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
