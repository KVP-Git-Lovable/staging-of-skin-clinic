import { useState, useEffect, useMemo } from "react";
import { useStackedTable } from "@/hooks/useStackedTable";
import { useNavigate } from "react-router-dom";
import { Search, Plus, MoreHorizontal, Phone, Mail, Filter, Loader2, Camera, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import ViewBar from "@/components/patients/listviews/ViewBar";
import ViewEditorDialog from "@/components/patients/listviews/ViewEditorDialog";
import PatientListViewTable from "@/components/patients/listviews/PatientListViewTable";
import ViewChartsPanel from "@/components/patients/listviews/ViewChartsPanel";
import ViewFiltersPanel from "@/components/patients/listviews/ViewFiltersPanel";
import PatientKanban from "@/components/patients/listviews/PatientKanban";
import PatientSplitView from "@/components/patients/listviews/PatientSplitView";
import KanbanSettingsDialog from "@/components/patients/listviews/KanbanSettingsDialog";
import FieldsDisplayDialog from "@/components/patients/listviews/FieldsDisplayDialog";
import { usePatientListViews } from "@/hooks/usePatientListViews";
import { applyFilters, sortRows, DEFAULT_VIEW_COLUMNS, fieldDef, GENDER_OPTIONS, STATUS_OPTIONS, SKIN_TYPE_OPTIONS, BLOOD_GROUP_OPTIONS, SOURCE_OPTIONS, ENGAGEMENT_TIER_OPTIONS, type ListView, type ListDisplayMode } from "@/lib/patientFields";
import { ALL_VIEW_ID, RECENT_VIEW_ID, getKanbanConfig, setKanbanConfig } from "@/lib/standardViews";
import { getRecentlyViewed, markRecentlyViewed } from "@/lib/recentlyViewed";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import { moveToTrash } from "@/lib/trash";
import { SalesforceSyncButton } from "@/components/salesforce/SalesforceSyncButton";


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
import { toast } from "sonner";
import { motion } from "framer-motion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { PatientFormSheet } from "@/components/patients/PatientFormSheet";
import { CameraCapture } from "@/components/shared/CameraCapture";
import { ImportPatientsDialog } from "@/components/patients/ImportPatientsDialog";
import { EngagementBadge } from "@/components/patients/EngagementBadge";
import { PatientAvatar } from "@/components/patients/PatientAvatar";
import { usePatientAvatars } from "@/hooks/usePatientAvatars";
import { useEngagementScores } from "@/hooks/useEngagementScores";
import { buildOrFilter, buildFuzzyOrFilter, fuzzyRank } from "@/lib/fuzzySearch";
import type { Tables } from "@/integrations/supabase/types";

type Patient = Tables<"patients">;

const PAGE_SIZE = 50;

const PATIENT_FIELDS = [
  { value: "name", label: "Patient Name" },
  { value: "contact", label: "Contact" },
  { value: "skin_type", label: "Skin Type" },
  { value: "engagement", label: "Engagement" },
  { value: "status", label: "Status" },
  { value: "gender", label: "Gender" },
  { value: "age", label: "Age" },
  { value: "date_of_birth", label: "Date of Birth" },
];

const DEFAULT_PATIENT_FIELDS = ["name", "contact", "skin_type", "engagement", "status"];

const PICKLIST_OPTIONS: Record<string, { value: string; label: string }[]> = {
  gender: GENDER_OPTIONS,
  status: STATUS_OPTIONS,
  skin_type: SKIN_TYPE_OPTIONS,
  blood_group: BLOOD_GROUP_OPTIONS,
  source: SOURCE_OPTIONS,
  engagement_tier: ENGAGEMENT_TIER_OPTIONS,
};

const fetchPatientsPage = async (
  page: number,
  search: string
): Promise<{ rows: Patient[]; total: number }> => {
  const fromIdx = (page - 1) * PAGE_SIZE;
  const toIdx = fromIdx + PAGE_SIZE - 1;
  const term = search.trim();
  const cols = ["first_name", "last_name", "email", "phone"];

  let q = supabase
    .from("patients")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(fromIdx, toIdx);

  if (term) {
    const tokens = term.split(/\s+/).filter(Boolean);

    // For 2+ token searches, try exact match first (first_name + last_name)
    if (tokens.length >= 2) {
      const [firstName, ...rest] = tokens;
      const lastName = rest.join(" ");

      // Step 1: Exact match (case-insensitive but whole word)
      const { data: exactMatch } = await supabase
        .from("patients")
        .select("*", { count: "exact" })
        .ilike("first_name", firstName)
        .ilike("last_name", lastName)
        .order("created_at", { ascending: false });

      if (exactMatch && exactMatch.length > 0) {
        return { rows: (exactMatch as Patient[]), total: exactMatch.length };
      }

      // Step 2: Prefix match (first_name starts with token AND last_name starts with lastName)
      const { data: prefixMatch } = await supabase
        .from("patients")
        .select("*", { count: "exact" })
        .ilike("first_name", `${firstName}%`)
        .ilike("last_name", `${lastName}%`)
        .order("created_at", { ascending: false });

      if (prefixMatch && prefixMatch.length > 0) {
        return { rows: (prefixMatch as Patient[]), total: prefixMatch.length };
      }
    } else if (tokens.length === 1) {
      // Single word: try exact match first
      const token = tokens[0];

      // Step 1: Exact match
      const { data: exactMatch } = await supabase
        .from("patients")
        .select("*", { count: "exact" })
        .or(`first_name.ilike.${token},last_name.ilike.${token}`)
        .order("created_at", { ascending: false });

      if (exactMatch && exactMatch.length > 0) {
        return { rows: (exactMatch as Patient[]), total: exactMatch.length };
      }

      // Step 2: Prefix match (starts with the term)
      const { data: prefixMatch } = await supabase
        .from("patients")
        .select("*")
        .or(`first_name.ilike.${token}%,last_name.ilike.${token}%`)
        .order("created_at", { ascending: false })
        .limit(PAGE_SIZE);

      if (prefixMatch && prefixMatch.length > 0) {
        return { rows: (prefixMatch as Patient[]), total: prefixMatch.length };
      }
    }

    // Final fallback: standard OR search (substring matching)
    const or = buildOrFilter(term, cols);
    if (or) q = q.or(or);
  }

  const { data, error, count } = await q;
  if (error) throw error;

  // Typo-tolerant fallback: nothing matched literally, so pull a loose candidate
  // set (matching the first few letters) and rank it by fuzzy similarity.
  if (term && (count ?? 0) === 0) {
    const looseOr = buildFuzzyOrFilter(term, ["first_name", "last_name"]);
    if (looseOr) {
      const { data: loose } = await supabase
        .from("patients")
        .select("*")
        .or(looseOr)
        .limit(300);
      const ranked = fuzzyRank(
        (loose as Patient[]) || [],
        term,
        (p) => `${p.first_name || ""} ${p.last_name || ""} ${p.phone || ""} ${p.email || ""}`,
        0.55
      );
      return { rows: ranked.slice(0, PAGE_SIZE), total: ranked.length };
    }
  }
  return { rows: (data as Patient[]) || [], total: count ?? 0 };
};

const fetchAllPatients = async (search: string): Promise<Patient[]> => {
  const term = search.trim();
  let q = supabase
    .from("patients")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  if (term) {
    const or = buildOrFilter(term, ["first_name", "last_name", "email", "phone"]);
    if (or) q = q.or(or);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data as Patient[]) || [];
};

const Patients = () => {

  const patientsTableRef = useStackedTable<HTMLTableElement>();
  const navigate = useNavigate();
  // Seeded from ?q= so global search can hand a term to this list view
  const [search, setSearch] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);
  const [cameraPatient, setCameraPatient] = useState<Patient | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deletePatient, setDeletePatient] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [display, setDisplay] = useState<ListDisplayMode>("table");
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [kanban, setKanban] = useState(() => getKanbanConfig("patients", ALL_VIEW_ID));

  const {
    allViews,
    userId,
    activeView,
    selectView,
    saveView,
    saveCharts,
    deleteView,
    pinDefault,
    updateStandardColumns,
  } = usePatientListViews("patients", "Patients");



  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const isAllView = !activeView || activeView.id === ALL_VIEW_ID;
  const isRecentView = activeView?.id === RECENT_VIEW_ID;
  const needsClientRows = !isAllView || display === "kanban" || display === "split";

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["patients", page, debouncedSearch],
    queryFn: () => fetchPatientsPage(page, debouncedSearch),
    placeholderData: keepPreviousData,
    enabled: !needsClientRows,
  });

  const {
    data: allPatients = [],
    isLoading: viewLoading,
    isFetching: viewFetching,
    refetch: refetchAll,
  } = useQuery({
    queryKey: ["patients-all", debouncedSearch],
    queryFn: () => fetchAllPatients(debouncedSearch),
    placeholderData: keepPreviousData,
    enabled: needsClientRows,
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role, auth_user_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const viewRows = useMemo(() => {
    if (!needsClientRows) return [] as Patient[];
    const source = allPatients as Patient[];
    if (isRecentView) {
      const ids = getRecentlyViewed("patients");
      const byId = new Map(source.map((p) => [p.id, p]));
      return ids.map((id) => byId.get(id)).filter(Boolean) as Patient[];
    }
    const filtered = activeView ? applyFilters(source, activeView.filters) : source;
    return activeView ? sortRows(filtered, activeView.sort_field, activeView.sort_dir) : filtered;
  }, [allPatients, activeView, needsClientRows, isRecentView]);

  const isBoard = display === "kanban" || display === "split";
  const paged: Patient[] = needsClientRows
    ? (isBoard ? viewRows : viewRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE))
    : data?.rows ?? [];
  const total = needsClientRows ? viewRows.length : data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const loading = needsClientRows ? viewLoading : isLoading;
  const fetching = needsClientRows ? viewFetching : isFetching;
  const reloadPatients = () => (needsClientRows ? refetchAll() : refetch());

  const patientIds = paged.map((p) => p.id);
  const { data: engagementScores = {} } = useEngagementScores(patientIds);
  const avatars = usePatientAvatars(patientIds);

  const doctorOptions = useMemo(
    () => staffList.filter((s: any) => s.role === "Doctor").map((s: any) => ({ value: s.id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() })),
    [staffList]
  );
  const doctorLabels = useMemo(
    () => Object.fromEntries(doctorOptions.map((d) => [d.value, d.label])),
    [doctorOptions]
  );

  const kanbanOptions = useMemo(() => {
    const src = fieldDef(kanban.group_field)?.optionsSource;
    if (src === "doctor") return doctorOptions;
    return PICKLIST_OPTIONS[src ?? ""] ?? [];
  }, [kanban.group_field, doctorOptions]);

  const openPatient = (row: Patient) => {
    markRecentlyViewed("patients", row.id);
    navigate(`/patients/${row.id}`);
  };

  const moveKanbanCard = async (row: Patient, field: string, value: string) => {
    const { error } = await supabase.from("patients").update({ [field]: value || null } as any).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Patient updated");
    refetchAll();
  };

  const getAge = (dob: string | null) => {
    if (!dob) return null;
    const diff = Date.now() - new Date(dob).getTime();
    return Math.floor(diff / (365.25 * 24 * 60 * 60 * 1000));
  };

  const displayColumns = activeView?.columns?.length ? activeView.columns : DEFAULT_VIEW_COLUMNS;

  // Tri-state column sorting: ascending → descending → cleared. One column at a time.
  const [sort, setSort] = useState<{ key: string | null; dir: "asc" | "desc" }>({ key: null, dir: "asc" });
  const handleSort = (key: string) =>
    setSort((s) =>
      s.key !== key ? { key, dir: "asc" } : s.dir === "asc" ? { key, dir: "desc" } : { key: null, dir: "asc" }
    );
  const tableRows = useMemo(
    () => (sort.key ? sortRows(paged, sort.key, sort.dir) : paged),
    [paged, sort]
  );

  const saveInline = async (row: Patient, key: string, value: any) => {
    const { error } = await supabase.from("patients").update({ [key]: value } as any).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Patient updated");
    reloadPatients();
  };

  const shouldShowColumn = (column: string) => DEFAULT_PATIENT_FIELDS.includes(column);



  useEffect(() => {
    setPage(1);
    setKanban(getKanbanConfig("patients", activeView?.id ?? ALL_VIEW_ID));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView?.id]);


  const openNewView = () => {
    setEditingView(null);
    setEditorOpen(true);
  };

  const openEditView = (v: ListView) => {
    setEditingView(v);
    setEditorOpen(true);
  };

  const cloneView = (v: ListView) => {
    setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false });
    setEditorOpen(true);
  };

  const openAdd = () => {

    setEditingPatient(null);
    setSheetOpen(true);
  };

  const openEdit = (patient: Patient) => {
    setEditingPatient(patient);
    setSheetOpen(true);
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (paged.length === 0) return;
    if (paged.every((p) => selectedIds.has(p.id))) {
      const next = new Set(selectedIds);
      paged.forEach((p) => next.delete(p.id));
      setSelectedIds(next);
    } else {
      const next = new Set(selectedIds);
      paged.forEach((p) => next.add(p.id));
      setSelectedIds(next);
    }
  };

  const patientLabel = (p: Patient) => `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.phone || "Unnamed";

  const handleBulkDelete = async () => {
    setDeleting(true);
    const ids = Array.from(selectedIds);
    try {
      for (const id of ids) {
        const row = paged.find((p) => p.id === id);
        await moveToTrash("patients", id, row ? patientLabel(row) : undefined);
      }
      toast.success(`Moved ${ids.length} patient${ids.length > 1 ? "s" : ""} to Trash`);
      setSelectedIds(new Set());
      setConfirmOpen(false);
      reloadPatients();
    } catch (e: any) {
      toast.error(`Failed to delete: ${e.message}`);
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteOne = async (patient: Patient) => {
    try {
      await moveToTrash("patients", patient.id, patientLabel(patient));
      toast.success("Patient moved to Trash");
      reloadPatients();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const allFilteredSelected = paged.length > 0 && paged.every((p) => selectedIds.has(p.id));

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Patients</h1>
          <p className="page-subtitle">Manage your patient records</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {selectedIds.size > 0 && (

            <Button variant="destructive" className="gap-2" onClick={() => setConfirmOpen(true)}>
              <Trash2 className="h-4 w-4" />
              Delete ({selectedIds.size})
            </Button>
          )}
          <SalesforceSyncButton />
          <Button variant="outline" className="gap-2" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import Patients
          </Button>
          <Button className="gap-2 w-fit" onClick={openAdd}>
            <Plus className="h-4 w-4" />
            Add Patient
          </Button>
        </div>
      </div>

      <div className="mb-4">
        <ViewBar
          views={allViews}
          activeView={activeView}
          currentUserId={userId}
          onSelect={selectView}
          onNew={openNewView}
          onEdit={openEditView}
          onDelete={(v) => setDeleteViewTarget(v)}
          onPin={pinDefault}
          onClone={cloneView}
          onFields={() => setFieldsOpen(true)}
          onRefresh={() => reloadPatients()}
          onKanbanSettings={() => setKanbanOpen(true)}
          display={display}
          onDisplayChange={setDisplay}
          count={total}
          search={search}
          onSearchChange={(v) => { setSearch(v); setPage(1); }}
          chartsOpen={chartsOpen}
          onToggleCharts={() => { setChartsOpen((o) => !o); setFiltersOpen(false); }}
          filtersOpen={filtersOpen}
          onToggleFilters={() => { setFiltersOpen((o) => !o); setChartsOpen(false); }}
        />
      </div>

      <div className="flex flex-col items-start gap-4 lg:flex-row">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="data-table min-w-0 flex-1 w-full"
      >

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <p className="text-sm">{debouncedSearch ? "No patients match your search." : "No patients yet. Add your first patient!"}</p>
          </div>
        ) : display === "kanban" ? (
          <PatientKanban
            rows={paged}
            config={kanban}
            options={kanbanOptions}
            columns={displayColumns}
            avatars={avatars}
            onOpen={openPatient}
            onMove={moveKanbanCard}
          />
        ) : display === "split" ? (
          <PatientSplitView rows={paged} columns={displayColumns} avatars={avatars} onOpen={openPatient} />
        ) : display === "table" ? (
          <PatientListViewTable
            rows={tableRows}
            columns={displayColumns}
            selectedIds={selectedIds}
            onToggle={toggleOne}
            onToggleAll={toggleAll}
            onOpen={openPatient}
            doctorLabels={doctorLabels}
            avatars={avatars}
            sortKey={sort.key}
            sortDir={sort.dir}
            onSort={handleSort}
            onInlineSave={saveInline}
            picklistOptions={PICKLIST_OPTIONS}
          />
        ) : (


          <div className="overflow-x-auto table-scroll">
            <table ref={patientsTableRef} className="w-full responsive-table">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="p-4 w-10">
                    <Checkbox
                      checked={allFilteredSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  {shouldShowColumn("name") && <th className="text-left text-xs font-medium text-muted-foreground p-4">Patient</th>}
                  {shouldShowColumn("contact") && <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden md:table-cell">Contact</th>}
                  {shouldShowColumn("skin_type") && <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden lg:table-cell">Skin Type</th>}
                  {shouldShowColumn("engagement") && <th className="text-left text-xs font-medium text-muted-foreground p-4 hidden sm:table-cell">Engagement</th>}
                  {shouldShowColumn("status") && <th className="text-left text-xs font-medium text-muted-foreground p-4">Status</th>}
                  <th className="text-right text-xs font-medium text-muted-foreground p-4"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paged.map((patient) => (
                  <tr key={patient.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => openPatient(patient)}>
                    <td className="p-4" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selectedIds.has(patient.id)}
                        onCheckedChange={() => toggleOne(patient.id)}
                        aria-label={`Select ${patient.first_name}`}
                      />
                    </td>
                    {shouldShowColumn("name") && (
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <PatientAvatar
                            firstName={patient.first_name}
                            lastName={patient.last_name}
                            photoUrl={avatars[patient.id]}
                          />
                          <div>
                            <p className="font-medium text-sm">{`${patient.first_name || ""} ${patient.last_name || ""}`.trim() || "Unnamed"}</p>
                            <p className="text-xs text-muted-foreground">
                              {patient.gender || "—"}
                              {getAge(patient.date_of_birth) !== null && ` · Age ${getAge(patient.date_of_birth)}`}
                            </p>
                          </div>
                        </div>
                      </td>
                    )}
                    {shouldShowColumn("contact") && (
                      <td className="p-4 hidden md:table-cell">
                        <div className="space-y-1">
                          {patient.phone && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              {patient.phone}
                            </div>
                          )}
                          {patient.email && (
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <Mail className="h-3 w-3" />
                              {patient.email}
                            </div>
                          )}
                        </div>
                      </td>
                    )}
                    {shouldShowColumn("skin_type") && (
                      <td className="p-4 hidden lg:table-cell">
                        <span className="text-sm">{patient.skin_type || "—"}</span>
                      </td>
                    )}
                    {shouldShowColumn("engagement") && (
                      <td className="p-4 hidden sm:table-cell">
                        <EngagementBadge data={engagementScores[patient.id]} />
                      </td>
                    )}
                    {shouldShowColumn("status") && (
                      <td className="p-4">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                          patient.status === "Active"
                            ? "bg-success/10 text-success"
                            : "bg-muted text-muted-foreground"
                        }`}>
                          {patient.status}
                        </span>
                      </td>
                    )}
                    <td className="p-4 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openEdit(patient); }}>
                            Edit Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); openPatient(patient); }}>
                            View Details
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setCameraPatient(patient); }}>
                            <Camera className="h-3.5 w-3.5 mr-1.5" /> Take Photo
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={(e) => { e.stopPropagation(); setDeletePatient(patient); }}
                          >
                            <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="p-4 border-t flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>
            {isBoard
              ? `Showing ${total.toLocaleString()} records`
              : `Showing ${total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, total)} of ${total.toLocaleString()}`}
            {fetching && !loading ? " · loading…" : ""}
          </span>
          {!isBoard && totalPages > 1 && (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <span className="text-xs">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      {(filtersOpen || chartsOpen) && (
        <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-80 xl:w-96 lg:max-h-[calc(100vh-8rem)]">
          {filtersOpen ? (
            <ViewFiltersPanel
              view={activeView}
              canManage={!!activeView && !activeView.is_standard && activeView.owner_id === userId}
              doctorOptions={doctorOptions}
              onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
              onClose={() => setFiltersOpen(false)}
            />
          ) : activeView && !activeView.is_standard ? (
            <ViewChartsPanel
              charts={activeView.charts ?? []}
              rows={viewRows}
              canManage={activeView.owner_id === userId}
              onChange={(charts) => saveCharts(activeView.id, charts)}
              onClose={() => setChartsOpen(false)}
            />
          ) : (
            <div className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
              Charts are available on custom list views. Create or select a custom view to add charts.
            </div>
          )}
        </aside>
      )}
      </div>



      <PatientFormSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        patient={editingPatient}
        onSuccess={() => reloadPatients()}
      />

      <ImportPatientsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onSuccess={() => reloadPatients()}
      />

      {cameraPatient && (
        <CameraCapture
          open={!!cameraPatient}
          onOpenChange={(o) => { if (!o) setCameraPatient(null); }}
          patientId={cameraPatient.id}
          patientName={`${cameraPatient.first_name} ${cameraPatient.last_name}`}
          context="patient"
        />
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} patient{selectedIds.size > 1 ? "s" : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              The selected patient records will be moved to Trash. You can restore them from Trash, or permanently
              delete them once the retention period set by your admin has passed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBulkDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? "Deleting..." : "Move to Trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DeleteConfirmDialog
        open={!!deletePatient}
        onOpenChange={(o) => { if (!o) setDeletePatient(null); }}
        entity={deletePatient ? `patient "${`${deletePatient.first_name || ""} ${deletePatient.last_name || ""}`.trim() || "Unnamed"}"` : "patient"}
        onConfirm={async () => { if (deletePatient) await handleDeleteOne(deletePatient); setDeletePatient(null); }}
      />

      <KanbanSettingsDialog
        open={kanbanOpen}
        onOpenChange={setKanbanOpen}
        config={kanban}
        onSave={(cfg) => {
          setKanban(cfg);
          setKanbanConfig("patients", activeView?.id ?? ALL_VIEW_ID, cfg);
          setDisplay("kanban");
        }}
      />

      <FieldsDisplayDialog
        open={fieldsOpen}
        onOpenChange={setFieldsOpen}
        viewName={activeView?.name ?? "All Patients"}
        columns={displayColumns}
        onSave={(cols) => {
          if (!activeView) return;
          if (activeView.is_standard) updateStandardColumns(activeView.id, cols);
          else saveView({ ...activeView, columns: cols });
        }}
      />

      <ViewEditorDialog

        open={editorOpen}
        onOpenChange={setEditorOpen}
        view={editingView}
        onSave={saveView}
        doctorOptions={doctorOptions}
        people={staffList
          .filter((s: any) => s.auth_user_id)
          .map((s: any) => ({ value: s.auth_user_id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() }))}
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

export default Patients;
