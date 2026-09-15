import { useStackedTable } from "@/hooks/useStackedTable";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useState, useCallback, useRef, useMemo, useEffect, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useModal } from "@/hooks/useModal";
import { useModuleListViews } from "@/hooks/useModuleListViews";
import ViewBar from "@/components/listViews/ViewBar";
import ViewEditorDialog, { type PickOption } from "@/components/listViews/ViewEditorDialog";
import FieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import ViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import ListKanban from "@/components/listViews/ListKanban";
import KanbanSettingsDialog from "@/components/listViews/KanbanSettingsDialog";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { applyFilters as applyListFilters, fieldDefIn, type ListDisplayMode, type ListView } from "@/lib/listViews/engine";
import { ALL_VIEW_ID, getKanbanConfig, setKanbanConfig } from "@/lib/listViews/standardViews";
import { APPOINTMENT_VIEW_FIELDS, DEFAULT_APPOINTMENT_VIEW_COLUMNS } from "@/lib/listViews/appointmentFields";
import { ChevronLeft, ChevronRight, Plus, Clock, Repeat, CalendarIcon, List, Phone, Search, Filter, GripVertical, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check as CheckIcon, X, AlertCircle, ClipboardCheck, ClipboardList, Pin, Printer, Trash2 } from "lucide-react";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import { moveToTrash } from "@/lib/trash";
import { AppointmentDetailSheet } from "@/components/appointments/AppointmentDetailSheet";
import { SalesforceSyncButton } from "@/components/salesforce/SalesforceSyncButton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, addWeeks, addMonths, addDays, startOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isWithinInterval } from "date-fns";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  SelectGroup,
  SelectLabel,

} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { PatientAvatar } from "@/components/patients/PatientAvatar";
import { usePatientAvatars } from "@/hooks/usePatientAvatars";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { toast } from "sonner";
import { fetchAll } from "@/lib/supabasePaginate";
import { fetchAppointmentsPage } from "@/lib/appointmentsPage";
import { printAppointments } from "@/lib/printAppointments";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { SurveyFill } from "@/components/surveys/SurveyFill";
import { MicButton } from "@/components/shared/MicButton";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { ConsultationReasonPicker, buildConsultationReasonsForSave, ConsultationType } from "@/components/appointments/ConsultationReasonPicker";
import { MANUAL_APPOINTMENT_STATUSES } from "@/lib/appointmentStatus";

// Lazy: pulls in recharts, kept out of the main bundle until a user actually opens Charts.
const ViewChartsPanel = lazy(() => import("@/components/listViews/ViewChartsPanel"));

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Helpers for splitting/rejoining the "yyyy-MM-ddTHH:mm" values the inline editor keeps. */
const datePart = (v: string) => (v || "").split("T")[0] || "";
const timePart = (v: string) => ((v || "").split("T")[1] || "").slice(0, 5);
const joinDateTime = (d: string, t: string) => (d && t ? `${d}T${t}` : "");
// 15-min slots from 8:00 to 19:45
const slots: { hour: number; minute: number }[] = [];
for (let h = 8; h < 20; h++) {
  for (let m = 0; m < 60; m += 15) {
    slots.push({ hour: h, minute: m });
  }
}

const DOCTOR_PALETTE = [
  { bg: "bg-primary/15", border: "border-primary/30", text: "text-primary", dot: "bg-primary" },
  { bg: "bg-info/15", border: "border-info/30", text: "text-info", dot: "bg-info" },
  { bg: "bg-success/15", border: "border-success/30", text: "text-success", dot: "bg-success" },
  { bg: "bg-warning/15", border: "border-warning/30", text: "text-warning", dot: "bg-warning" },
  { bg: "bg-destructive/15", border: "border-destructive/30", text: "text-destructive", dot: "bg-destructive" },
  { bg: "bg-accent", border: "border-accent-foreground/30", text: "text-accent-foreground", dot: "bg-accent-foreground" },
];

const statusOptions = [...MANUAL_APPOINTMENT_STATUSES];
const visitStatusOptions = ["Follow-up visit", "Recurring visit"];

const PINNED_FILTERS_KEY = "appointments.pinnedFilters";

const DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "yesterday", label: "Yesterday" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "next_week", label: "Next Week" },
  { key: "this_month", label: "This Month" },
  { key: "specific", label: "Specific Date" },
  { key: "range", label: "Date Range" },
  { key: "all", label: "All Dates" },
];

const DEFAULT_APPOINTMENT_FIELDS = [
  "patient",
  "phone",
  "service",
  "doctor",
  "start_time",
  "time",
  "status",
  "bill",
  "visit_status",
  "payment_mode",
];

// Status → tailwind classes for calendar cards (background + border + text)
const STATUS_CARD_CLASSES: Record<string, string> = {
  Reserved: "bg-info/15 border-info/30 text-info",
  Confirmed: "bg-success/15 border-success/30 text-success",
  "Checked In": "bg-warning/15 border-warning/30 text-warning",
  Cancelled: "bg-destructive/15 border-destructive/30 text-destructive",
  Completed: "bg-success/15 border-success/30 text-success",
  "No Show": "bg-destructive/15 border-destructive/30 text-destructive",
  "Follow Up": "bg-warning/15 border-warning/30 text-warning",
};

// Status → tailwind classes for badges (sidebar, legend, table)
const STATUS_BADGE_CLASSES: Record<string, string> = {
  Reserved: "bg-info/15 text-info border-info/30",
  Confirmed: "bg-success/15 text-success border-success/30",
  "Checked In": "bg-warning/15 text-warning border-warning/30",
  Cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  Completed: "bg-success/15 text-success border-success/30",
  "No Show": "bg-destructive/15 text-destructive border-destructive/30",
  "Follow Up": "bg-warning/15 text-warning border-warning/30",
  "Recurring appointment": "bg-primary/15 text-primary border-primary/30",
  Proposed: "bg-muted text-muted-foreground border-border",
};

const badgeClasses = (status: string) =>
  STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES.Proposed;

const Appointments = () => {
  const appointmentsTableRef = useStackedTable<HTMLTableElement>();
  const queryClient = useQueryClient();
  const routerNavigate = useNavigate();
  const { setOpenModal, openModal } = useModal();
  // Inside the full-screen overlay the page does not scroll with the window
  // (the shell is clamped), so window-based virtualization would leave blank
  // space. Render every row of the page directly in that case.
  const inOverlay = !!openModal;
  const [searchParams, setSearchParams] = useSearchParams();
  const [showBillingPrompt, setShowBillingPrompt] = useState(false);
  const [lastCreatedPatientId, setLastCreatedPatientId] = useState("");
  const [lastCreatedService, setLastCreatedService] = useState("");
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;
  const [view, setView] = useState<"week" | "day" | "month" | "table">("table");

  // List views management (table view only - the calendar keeps its own
  // doctor/status/date filter bar below, untouched)
  const {
    allViews,
    userId: viewsUserId,
    activeView,
    selectView,
    saveView,
    saveCharts,
    deleteView,
    pinDefault,
    updateStandardColumns,
  } = useModuleListViews("appointments", "Appointments", DEFAULT_APPOINTMENT_VIEW_COLUMNS);
  const [viewEditorOpen, setViewEditorOpen] = useState(false);
  const [editingView, setEditingView] = useState<ListView | null>(null);
  const [deleteViewTarget, setDeleteViewTarget] = useState<ListView | null>(null);
  const [viewFieldsOpen, setViewFieldsOpen] = useState(false);
  const [viewFiltersOpen, setViewFiltersOpen] = useState(false);
  const [viewChartsOpen, setViewChartsOpen] = useState(false);
  // Display mode within the "List" (table) view specifically - table or
  // kanban. Independent of `view` (Day/Week/Month/List) above.
  const [tableDisplay, setTableDisplay] = useState<ListDisplayMode>("table");
  const [kanbanOpen, setKanbanOpen] = useState(false);
  const [kanban, setKanban] = useState(() => getKanbanConfig("appointments", ALL_VIEW_ID));
  const [currentDate, setCurrentDate] = useState(new Date());
  const [open, setOpen] = useState(false);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const today = new Date();

  // Filter state — pinned filters are restored from localStorage
  const pinnedInit: Record<string, any> = (() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(localStorage.getItem(PINNED_FILTERS_KEY) || "{}"); } catch { return {}; }
  })();
  const [pinnedFilters, setPinnedFilters] = useState<Record<string, any>>(pinnedInit);
  const [filterDoctors, setFilterDoctors] = useState<Set<string>>(
    new Set(pinnedInit.doctor ? [pinnedInit.doctor as string] : [])
  );
  const [filterStatus, setFilterStatus] = useState<string>(pinnedInit.status || "all");
  const [filterVisitStatus, setFilterVisitStatus] = useState<string>(pinnedInit.visit || "all");
  // Date filter: preset key + optional specific date / range
  const [datePreset, setDatePreset] = useState<string>(pinnedInit.date || "this_week");
  const [rangePopoverOpen, setRangePopoverOpen] = useState(false);
  const [rangeCalendarMode, setRangeCalendarMode] = useState<"from" | "to">("from");
  const [specificDate, setSpecificDate] = useState<Date | undefined>(
    pinnedInit.specificDate ? new Date(pinnedInit.specificDate) : undefined
  );
  const [rangeFrom, setRangeFrom] = useState<Date | undefined>(
    pinnedInit.rangeFrom ? new Date(pinnedInit.rangeFrom) : undefined
  );
  const [rangeTo, setRangeTo] = useState<Date | undefined>(
    pinnedInit.rangeTo ? new Date(pinnedInit.rangeTo) : undefined
  );
  // Seeded from ?q= so global search can hand a term to this list view
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("q") || "");
  const [showFilters, setShowFilters] = useState(false);

  // Server-side pagination for the List/table view
  const APPT_PAGE_SIZE = 200;
  const [apptPage, setApptPage] = useState(1);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const persistPinned = (next: Record<string, any>) => {
    setPinnedFilters(next);
    if (Object.keys(next).length) localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify(next));
    else localStorage.removeItem(PINNED_FILTERS_KEY);
  };

  const togglePin = (key: string, value: any) => {
    const next = { ...pinnedFilters };
    if (next[key] !== undefined) {
      delete next[key];
      if (key === "date") { delete next.specificDate; delete next.rangeFrom; delete next.rangeTo; }
    } else {
      next[key] = value;
      if (key === "date") {
        if (specificDate) next.specificDate = specificDate.toISOString();
        if (rangeFrom) next.rangeFrom = rangeFrom.toISOString();
        if (rangeTo) next.rangeTo = rangeTo.toISOString();
      }
    }
    persistPinned(next);
  };

  const PinButton = ({ pinKey, value, label }: { pinKey: string; value: any; label: string }) => {
    const isPinned = pinnedFilters[pinKey] !== undefined;
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("h-9 px-2 rounded-l-none border-l-0", isPinned && "text-primary")}
        title={isPinned ? `Unpin ${label}` : `Pin ${label} as default`}
        aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
        onClick={() => togglePin(pinKey, value)}
      >
        <Pin className={cn("h-3.5 w-3.5", isPinned ? "fill-current" : "opacity-50")} />
      </Button>
    );
  };

  // Sort state for table view
  const [sortColumn, setSortColumn] = useState<string>("start_time");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // Apply a custom saved view's sorting when one is selected. The standard
  // "All"/"Recently Viewed" views default sort_field to "created_at" -
  // ignored here so the table's default order (start_time/asc) is unchanged
  // when no custom view is active.
  useEffect(() => {
    if (activeView && !activeView.is_standard) {
      setSortColumn(activeView.sort_field || "start_time");
      setSortDirection(activeView.sort_dir || "asc");
    }
  }, [activeView?.id]);

  // Inline edit state
  const [editingRow, setEditingRow] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<any>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string } | null>(null);

  // Drag-reschedule state
  const dragRef = useRef<{ aptId: string; originalStart: string; originalEnd: string } | null>(null);

  // Drag-to-select state for creating multi-slot appointments
  const dragSelectRef = useRef<{ date: Date; startSlotIndex: number } | null>(null);
  const [dragSelectEnd, setDragSelectEnd] = useState<number | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState("Reserved");
  const [visitStatus, setVisitStatus] = useState("");
  const [consultationType, setConsultationType] = useState<ConsultationType | "">("");
  const [consultationReasons, setConsultationReasons] = useState<string[]>([]);
  const [othersAestheticText, setOthersAestheticText] = useState("");
  const [othersClinicalText, setOthersClinicalText] = useState("");
  const [additionalInfoOpen, setAdditionalInfoOpen] = useState(false);
  const [appointmentType, setAppointmentType] = useState<"Walk-in" | "Online">("Walk-in");
  const [startDate, setStartDate] = useState<Date>();
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("09:15");
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrencePattern, setRecurrencePattern] = useState("weekly");
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<Date>();
  const [selectedProblemAreas, setSelectedProblemAreas] = useState<string[]>([]);
  const [assignSurveyTemplateId, setAssignSurveyTemplateId] = useState<string>("");
  const [sendingSurveyLink, setSendingSurveyLink] = useState(false);
  const [fillNowSurveyTemplateId, setFillNowSurveyTemplateId] = useState<string>("");
  const [pendingFillNow, setPendingFillNow] = useState<{
    templateId: string;
    appointmentId: string;
    patientId: string;
  } | null>(null);

  const [lockPatient, setLockPatient] = useState(false);

  // Auto-open New Appointment dialog with preselected patient (from Patient profile)
  useEffect(() => {
    const shouldOpen = searchParams.get("new") === "1";
    const presetPatient = searchParams.get("patient_id");
    if (shouldOpen) {
      if (presetPatient) {
        setPatientId(presetPatient);
        setLockPatient(true);
      }
      setOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("new");
      next.delete("patient_id");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Queries
  const { data: patients = [] } = useQuery({
    queryKey: ["patients-list"],
    queryFn: async () => {
      return await fetchAll<any>((from, to) =>
        supabase
          .from("patients")
          .select("id, first_name, last_name, phone, source, source_ad_details, source_referral_doctor")
          .order("first_name")
          .range(from, to)
      );
    },
  });

  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role, specialization, auth_user_id").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const doctorsList = useMemo(() => (staffList as any[]).filter((s: any) => (s.role || "").toLowerCase() === "doctor"), [staffList]);
  // Other active staff (nurse, therapist, etc.) can also be assigned to an appointment
  const otherStaffList = useMemo(() => (staffList as any[]).filter((s: any) => (s.role || "").toLowerCase() !== "doctor"), [staffList]);

  // Saved-view filter builder options for the picklist fields
  const viewDoctorOptions: PickOption[] = useMemo(
    () => doctorsList.map((d: any) => ({ value: d.id, label: `${d.first_name || ""} ${d.last_name || ""}`.trim() })),
    [doctorsList]
  );
  const viewOptionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "doctor": return viewDoctorOptions;
      case "status": return statusOptions.map((s) => ({ value: s, label: s }));
      case "visit_status": return visitStatusOptions.map((s) => ({ value: s, label: s }));
      default: return [];
    }
  };

  const kanbanGroupFields = APPOINTMENT_VIEW_FIELDS.filter((f) => f.type === "picklist");
  const kanbanSummaryFields = APPOINTMENT_VIEW_FIELDS.filter((f) => f.type === "number");
  const kanbanOptions = viewOptionsFor(fieldDefIn(APPOINTMENT_VIEW_FIELDS, kanban.group_field)?.optionsSource);
  // Kanban cards keep working off the original appointment rows (so a drag
  // still triggers the same WhatsApp-notify status-change path the inline
  // table Select uses) - this resolves the denormalized field keys
  // (doctor/bill/payment_mode/etc.) from them without remapping the rows.
  const kanbanRawValue = (row: any, key: string) => (toViewRow(row, pageInvoiceByAppointmentId) as any)[key];

  const moveKanbanCard = (apt: any, field: string, value: string) => {
    const updates: any = { id: apt.id, [field]: value || null };
    if (field === "status") {
      updates.__notify = {
        phone: apt.patients?.phone || "",
        patientName: apt.patient_name || (apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : ""),
        prevStatus: apt.status,
        newStatus: value,
        startTime: apt.start_time,
        doctorName: apt.staff_id ? (staffMap.get(apt.staff_id) || "") : "",
        serviceName: apt.service || "",
        patientGender: apt.patients?.gender || null,
      };
    }
    inlineUpdateMutation.mutate(updates);
  };

  useEffect(() => {
    setKanban(getKanbanConfig("appointments", activeView?.id ?? ALL_VIEW_ID));
  }, [activeView?.id]);


  const { data: services = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: problemAreasList = [] } = useQuery({
    queryKey: ["problem-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: activeSurveyTemplates = [] } = useQuery({
    queryKey: ["active-survey-templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("survey_templates")
        .select("id, name, service_id, problem_area_id")
        .eq("is_active", true)
        .eq("approval_status", "approved")
        .order("name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("holidays")
        .select("date")
        .order("date");
      if (error) throw error;
      return (data || []).map((h: any) => h.date);
    },
  });

  // Auto-propose a survey based on the selected service / primary concern.
  const [autoSurveyName, setAutoSurveyName] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (assignSurveyTemplateId || fillNowSurveyTemplateId) return;
    if (!activeSurveyTemplates.length) return;
    const match =
      (serviceId && (activeSurveyTemplates as any[]).find((t) => t.service_id === serviceId)) ||
      (selectedProblemAreas.length > 0 &&
        (activeSurveyTemplates as any[]).find((t) => t.problem_area_id && selectedProblemAreas.includes(t.problem_area_id)));
    if (match) {
      setAssignSurveyTemplateId(match.id);
      setAutoSurveyName(match.name);
    }
  }, [open, serviceId, selectedProblemAreas, activeSurveyTemplates, assignSurveyTemplateId, fillNowSurveyTemplateId]);

  // Date filter logic (shared by quick buttons and the date dropdown) - also
  // used to bound the appointments query itself (see below), since fetching
  // every appointment ever (now tens of thousands, with Salesforce history
  // synced in) on every page load is too slow. "All Dates" intentionally
  // stays unbounded - that's an explicit choice to pull full history.
  const getDateFilterRange = (preset: string): { start: Date; end: Date } | null => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);
    const endOfDay = (d: Date) => { const e = new Date(d); e.setHours(23, 59, 59, 999); return e; };
    const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    switch (preset) {
      case "today": return { start: todayStart, end: todayEnd };
      case "tomorrow": return { start: addDays(todayStart, 1), end: addDays(todayEnd, 1) };
      case "yesterday": return { start: addDays(todayStart, -1), end: addDays(todayEnd, -1) };
      case "this_week": return { start: startOfWeek(todayStart), end: endOfWeek(todayStart) };
      case "last_week": return { start: startOfWeek(addDays(todayStart, -7)), end: endOfWeek(addDays(todayStart, -7)) };
      case "next_week": return { start: startOfWeek(addDays(todayStart, 7)), end: endOfWeek(addDays(todayStart, 7)) };
      case "this_month": return { start: startOfMonth(todayStart), end: endOfDay(endOfMonth(todayStart)) };
      case "specific": return specificDate ? { start: startOfDay(specificDate), end: endOfDay(specificDate) } : null;
      case "range":
        if (!rangeFrom && !rangeTo) return null;
        return {
          start: rangeFrom ? startOfDay(rangeFrom) : new Date(1970, 0, 1),
          end: rangeTo ? endOfDay(rangeTo) : new Date(2999, 0, 1),
        };
      default: return null;
    }
  };

  // The Day/Week/Month calendars navigate on their own (currentDate), so they
  // must be bounded by the visible calendar window - not by the List view's
  // Quick date preset, which previously left Week/Month empty whenever the
  // preset (e.g. "Today") was narrower than the calendar window.
  const calendarDateRange = useMemo(() => {
    const dayStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), currentDate.getDate());
    const dayEnd = new Date(dayStart); dayEnd.setHours(23, 59, 59, 999);
    if (view === "day") return { start: dayStart, end: dayEnd };
    if (view === "week") return { start: startOfWeek(dayStart), end: endOfWeek(dayStart) };
    if (view === "month") return { start: startOfWeek(startOfMonth(dayStart)), end: endOfWeek(endOfMonth(dayStart)) };
    return null;
  }, [view, currentDate]);

  const appointmentsDateRange = view === "table" ? getDateFilterRange(datePreset) : calendarDateRange;

  // A saved view's filter conditions run client-side (some fields, like bill
  // amount / payment mode, only exist after joining invoices). Server-side
  // pagination would then filter just the current 200-row page, producing
  // empty pages and wrong totals - so whenever a view has filters we fall
  // back to the full date-bounded fetch and paginate in memory.
  const viewHasFilters = Boolean(activeView?.filters?.conditions?.length);

  const { data: appointments = [] } = useQuery({
    queryKey: ["appointments", datePreset, appointmentsDateRange?.start?.toISOString(), appointmentsDateRange?.end?.toISOString()],
    queryFn: async () => {
      return await fetchAll<any>((from, to) => {
        let q = supabase
          .from("appointments")
          .select("*, patients(first_name, last_name, phone, gender)")
          .order("start_time")
          .range(from, to);
        if (appointmentsDateRange) {
          q = q
            .gte("start_time", appointmentsDateRange.start.toISOString())
            .lte("start_time", appointmentsDateRange.end.toISOString());
        }
        return q;
      });
    },
    // Day/Week/Month views only - the List view uses the server-paginated
    // query below instead of pulling the full date range into memory
    // (unless a saved view's client-side filters are active).
    enabled: view !== "table" || viewHasFilters,
  });

  const sortedFilterDoctors = useMemo(() => Array.from(filterDoctors).sort(), [filterDoctors]);

  const apptPageQueryKey = [
    "appointments",
    "page",
    apptPage,
    APPT_PAGE_SIZE,
    datePreset,
    appointmentsDateRange?.start?.toISOString(),
    appointmentsDateRange?.end?.toISOString(),
    sortedFilterDoctors.join(","),
    filterStatus,
    filterVisitStatus,
    debouncedSearchQuery.trim(),
    sortColumn,
    sortDirection,
  ];

  const { data: apptPageData, isFetching: isApptPageFetching } = useQuery({
    queryKey: apptPageQueryKey,
    queryFn: () =>
      fetchAppointmentsPage({
        page: apptPage,
        pageSize: APPT_PAGE_SIZE,
        dateRange: appointmentsDateRange,
        doctorIds: sortedFilterDoctors,
        status: filterStatus,
        visitStatus: filterVisitStatus,
        search: debouncedSearchQuery,
        sortColumn,
        sortDirection,
      }),
    placeholderData: keepPreviousData,
    enabled: view === "table" && !viewHasFilters,
  });

  // Reset to page 1 whenever any input that reshapes the result set changes
  useEffect(() => {
    setApptPage(1);
  }, [datePreset, appointmentsDateRange?.start?.toISOString(), appointmentsDateRange?.end?.toISOString(), sortedFilterDoctors.join(","), filterStatus, filterVisitStatus, debouncedSearchQuery, sortColumn, sortDirection, activeView?.id]);

  // NOTE: Past Confirmed appointments are intentionally NOT auto-flipped to
  // "No Show" on page load. Doing so silently rewrote real attended visits
  // (where staff simply never clicked "Checked In") as no-shows, corrupting
  // history and status-based reporting. "No Show" is now a deliberate manual
  // status change made by staff from the appointment record.

  const [printing, setPrinting] = useState(false);
  const handlePrint = async () => {
    setPrinting(true);
    try {
      const presetLabel = DATE_PRESETS.find((p) => p.key === datePreset)?.label || "All dates";
      const rangeLabel = appointmentsDateRange
        ? `${presetLabel}: ${format(appointmentsDateRange.start, "dd MMM yyyy")} – ${format(appointmentsDateRange.end, "dd MMM yyyy")}`
        : presetLabel;
      await printAppointments(
        {
          dateRange: appointmentsDateRange,
          doctorIds: sortedFilterDoctors,
          status: filterStatus,
          visitStatus: filterVisitStatus,
          search: debouncedSearchQuery,
          sortColumn,
          sortDirection,
        },
        { rangeLabel, staffName: (id) => (id ? staffMap.get(id) || "" : ""), clinicName: "Appointments" },
      );
    } catch (e: any) {
      toast.error(e.message || "Could not open the print view");
    } finally {
      setPrinting(false);
    }
  };

  // Build a staff lookup map
  const staffMap = useMemo(() => {
    const map = new Map<string, string>();
    staffList.forEach((d: any) => map.set(d.id, `${d.first_name} ${d.last_name}`));
    return map;
  }, [staffList]);

  // Fetch invoices for bill amount - used by the Day/Week/Month calendar
  // views (via filteredAppointments/applyViewFilters/toViewRow), which still
  // work off the full date-bounded appointments set, so this stays a full
  // fetch too, just skipped while on the List/table view (see
  // pageInvoiceByAppointmentId).
  const { data: invoices = [] } = useQuery({
    queryKey: ["invoices-for-appointments"],
    queryFn: async () => {
      return await fetchAll<any>((from, to) =>
        supabase
          .from("invoices")
          .select("id, appointment_id, total_amount, paid_amount, payment_mode, status")
          .range(from, to)
      );
    },
    enabled: view !== "table" || viewHasFilters,
  });

  const invoiceByAppointmentId = useMemo(() => {
    const map = new Map<string, any>();
    invoices.forEach((inv: any) => {
      if (inv.appointment_id) map.set(inv.appointment_id, inv);
    });
    return map;
  }, [invoices]);

  // Invoices for the List/table view - scoped to just the current page's
  // appointment ids instead of the whole invoices table.
  const pageApptIds = useMemo(
    () => (apptPageData?.rows ?? []).map((a: any) => a.id),
    [apptPageData]
  );
  const { data: pageInvoices = [] } = useQuery({
    queryKey: ["invoices-for-appointments", "page", pageApptIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, appointment_id, total_amount, paid_amount, payment_mode, status")
        .in("appointment_id", pageApptIds);
      if (error) throw error;
      return data || [];
    },
    enabled: view === "table" && !viewHasFilters && pageApptIds.length > 0,
  });

  const pageInvoiceByAppointmentId = useMemo(() => {
    const map = new Map<string, any>();
    pageInvoices.forEach((inv: any) => {
      if (inv.appointment_id) map.set(inv.appointment_id, inv);
    });
    return map;
  }, [pageInvoices]);

  const dateFilterLabel = (() => {
    if (datePreset === "specific") return specificDate ? format(specificDate, "MMM d, yyyy") : "Specific Date";
    if (datePreset === "range")
      return rangeFrom || rangeTo
        ? `${rangeFrom ? format(rangeFrom, "MMM d") : "…"} – ${rangeTo ? format(rangeTo, "MMM d") : "…"}`
        : "Date Range";
    return DATE_PRESETS.find((p) => p.key === datePreset)?.label || "All Dates";
  })();

  // Denormalize an appointment (+ its invoice) into the flat shape
  // APPOINTMENT_VIEW_FIELDS' filter/sort engine reads. `invMap` lets callers
  // pass a scoped invoice lookup (the table view only fetches invoices for
  // its current page, per the "bill amount is page-scoped" tradeoff).
  const toViewRow = (apt: any, invMap: Map<string, any>) => {
    const inv = invMap.get(apt.id);
    return {
      id: apt.id,
      start_time: apt.start_time,
      time: format(new Date(apt.start_time), "h:mm a"),
      patient: apt.patient_name || (apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : ""),
      phone: apt.patients?.phone || "",
      service: apt.service || "",
      doctor: apt.staff_id || "",
      status: apt.status || "",
      visit_status: apt.visit_status || "",
      bill: inv?.total_amount || 0,
      payment_mode: inv?.payment_mode || "",
    };
  };

  // Apply the active saved view's filters (if any). Keeps the same call
  // signature/sites as before so both calendar and table rows are filtered
  // exactly as they were pre-migration - only the underlying engine and its
  // (richer, multi-condition) filter UI changed.
  const applyViewFilters = (items: any[], invMap: Map<string, any> = invoiceByAppointmentId) => {
    if (!activeView?.filters?.conditions?.length) return items;
    const denormalized = items.map((apt) => toViewRow(apt, invMap));
    const kept = new Set(applyListFilters(denormalized, activeView.filters, APPOINTMENT_VIEW_FIELDS).map((r) => r.id));
    return items.filter((apt) => kept.has(apt.id));
  };

  // Filtered appointments
  let filteredAppointments = appointments.filter((apt: any) => {
    if (filterDoctors.size > 0 && apt.staff_id && !filterDoctors.has(apt.staff_id)) return false;
    if (filterStatus !== "all" && apt.status !== filterStatus) return false;
    if (filterVisitStatus !== "all" && (apt.visit_status || "") !== filterVisitStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = apt.patient_name || (apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : "");
      const d = new Date(apt.start_time);
      const dateTokens = [
        format(d, "MMM d, yyyy"),
        format(d, "dd/MM/yyyy"),
        format(d, "yyyy-MM-dd"),
        format(d, "MMMM yyyy"),
        format(d, "h:mm a"),
      ].join(" ").toLowerCase();
      const haystack = `${name} ${apt.patients?.phone || ""} ${apt.service || ""} ${dateTokens}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    const dateRange = appointmentsDateRange;
    if (dateRange && !isWithinInterval(new Date(apt.start_time), dateRange)) return false;
    return true;
  });

  // Apply view filters
  filteredAppointments = applyViewFilters(filteredAppointments);

  // Rows for the List/table view: the current server-fetched page, plus a
  // residual client-side pass for saved-view filter fields that only exist
  // via client-side lookups (bill/payment_mode - see pageInvoiceByAppointmentId
  // below).
  const apptPageRows = apptPageData?.rows ?? [];
  const serverPageRows = useMemo(
    () => applyViewFilters(apptPageRows, pageInvoiceByAppointmentId),
    [apptPageRows, activeView, pageInvoiceByAppointmentId]
  );
  // With saved-view filters active the full filtered set is already in memory,
  // so slice it locally and report its true size.
  const apptTotal = viewHasFilters ? filteredAppointments.length : (apptPageData?.total ?? 0);
  const visibleTableRows = viewHasFilters
    ? filteredAppointments.slice((apptPage - 1) * APPT_PAGE_SIZE, apptPage * APPT_PAGE_SIZE)
    : serverPageRows;

  // Patient display pictures for quick recognition in the appointment list
  const appointmentPatientIds = useMemo(
    () => visibleTableRows.map((a: any) => a.patient_id).filter(Boolean),
    [visibleTableRows]
  );
  const appointmentAvatars = usePatientAvatars(appointmentPatientIds);

  // Row virtualization for the List/table view - keeps only the rows near
  // the viewport actually mounted, since each row is fairly heavy (avatar,
  // a live status Select, badges). Windows against the page scroll itself
  // (no nested scroll container) via scrollMargin = the table's offset from
  // the top of the document.
  const [tableScrollMargin, setTableScrollMargin] = useState(0);
  useEffect(() => {
    if (view !== "table") return;
    const measure = () => {
      const el = appointmentsTableRef.current;
      if (!el) return;
      const next = Math.round(el.getBoundingClientRect().top + window.scrollY);
      // Observing the table itself (not the whole body) plus this equality
      // guard stops the measure -> reflow -> measure loop that used to let
      // the offset drift and leave a tall blank area under the last row.
      setTableScrollMargin((prev) => (prev === next ? prev : next));
    };
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { passive: true });
    const el = appointmentsTableRef.current;
    const ro = new ResizeObserver(measure);
    if (el) ro.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, [view, visibleTableRows.length]);

  const rowVirtualizer = useWindowVirtualizer({
    count: view === "table" ? visibleTableRows.length : 0,
    estimateSize: () => 57,
    overscan: 8,
    scrollMargin: tableScrollMargin,
  });

  // Get columns to display based on active saved view or default
  const displayColumns = activeView?.columns?.length ? activeView.columns : DEFAULT_APPOINTMENT_FIELDS;

  // Check if a column should be displayed
  const shouldShowColumn = (column: string) => displayColumns.includes(column);

  const toggleSort = (column: string) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  const startInlineEdit = (apt: any) => {
    setEditingRow(apt.id);
    setEditValues({
      service: apt.service || "",
      staff_id: apt.staff_id || "",
      status: apt.status,
      start_time: format(new Date(apt.start_time), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(new Date(apt.end_time), "yyyy-MM-dd'T'HH:mm"),
    });
  };

  const saveInlineEdit = async () => {
    if (!editingRow) return;
    const updates: any = {};
    if (editValues.service) updates.service = editValues.service;
    if (editValues.staff_id) updates.staff_id = editValues.staff_id;
    if (editValues.status) updates.status = editValues.status;
    if (editValues.start_time) updates.start_time = new Date(editValues.start_time).toISOString();
    if (editValues.end_time) updates.end_time = new Date(editValues.end_time).toISOString();
    inlineUpdateMutation.mutate({ id: editingRow, ...updates });
    setEditingRow(null);
    setEditValues({});
  };

  const cancelInlineEdit = () => {
    setEditingRow(null);
    setEditValues({});
  };

  // Generate recurring dates
  const generateRecurringDates = (start: Date, pattern: string, endDate: Date): Date[] => {
    const dates: Date[] = [start];
    let current = new Date(start);
    const maxOccurrences = 52;
    for (let i = 0; i < maxOccurrences; i++) {
      if (pattern === "weekly") current = addWeeks(current, 1);
      else if (pattern === "biweekly") current = addWeeks(current, 2);
      else if (pattern === "monthly") current = addMonths(current, 1);
      if (current > endDate) break;
      dates.push(new Date(current));
    }
    return dates;
  };

  const createAppointment = useMutation({
    mutationFn: async () => {
      if (!startDate) throw new Error("Please select a date");
      const buildDateTime = (date: Date, time: string) => {
        const [h, m] = time.split(":").map(Number);
        const dt = new Date(date);
        dt.setHours(h, m, 0, 0);
        return dt;
      };
      const startDT = buildDateTime(startDate, startTime);
      if (startDT < new Date()) throw new Error("Cannot book appointments in the past");

      // Sundays are allowed — only configured holidays block booking
      const dateStr = format(startDate, "yyyy-MM-dd");
      if (holidays.includes(dateStr)) {
        throw new Error(`Appointments cannot be booked on this date (holiday)`);
      }

      // Check recurring dates for holidays
      if (isRecurring && recurrenceEndDate) {
        const recurringDates = generateRecurringDates(startDate, recurrencePattern, recurrenceEndDate);
        const blockedDates = recurringDates.filter((d) => holidays.includes(format(d, "yyyy-MM-dd")));

        if (blockedDates.length > 0) {
          const blockedStr = blockedDates.slice(0, 3).map((d) => format(d, "MMM dd")).join(", ");
          throw new Error(`Some dates in the recurrence are unavailable: ${blockedStr}${blockedDates.length > 3 ? "..." : ""}`);
        }
      }

      const patient = patients.find((p) => p.id === patientId);
      const patientName = patient ? `${patient.first_name} ${patient.last_name}` : null;
      // Appointments created from the clinic app are always tagged "Walk-in".
      // Portal-originated bookings tag themselves as "portal" at creation time.
      const patientSource = "Walk-in";
      const selectedService = services.find((s) => s.id === serviceId);
      const serviceName = selectedService?.name || "";
      const wasRecurring = isRecurring && !!recurrenceEndDate;
      let newAppointmentId: string | null = null;

      // Build the list of (start, end) windows we need to validate
      const windows: { start: Date; end: Date }[] = wasRecurring
        ? generateRecurringDates(startDate, recurrencePattern, recurrenceEndDate!).map((d) => ({
            start: buildDateTime(d, startTime),
            end: buildDateTime(d, endTime),
          }))
        : [{ start: startDT, end: buildDateTime(startDate, endTime) }];

      // Client-side overlap pre-check (the DB trigger is the authoritative guard)
      if (staffId) {
        const minStart = new Date(Math.min(...windows.map((w) => w.start.getTime())));
        const maxEnd = new Date(Math.max(...windows.map((w) => w.end.getTime())));
        const { data: existing, error: existingErr } = await supabase
          .from("appointments")
          .select("start_time, end_time, patient_name, status")
          .eq("staff_id", staffId)
          .lt("start_time", maxEnd.toISOString())
          .gt("end_time", minStart.toISOString());
        if (existingErr) throw existingErr;
        const blockers = (existing || []).filter(
          (a: any) => !["Cancelled"].includes(a.status),
        );
        const conflicts = windows
          .map((w) => {
            const hit = blockers.find(
              (a: any) => new Date(a.start_time) < w.end && new Date(a.end_time) > w.start,
            );
            return hit ? { w, hit } : null;
          })
          .filter(Boolean) as { w: { start: Date; end: Date }; hit: any }[];
        if (conflicts.length > 0) {
          const first = conflicts[0];
          const when = format(new Date(first.hit.start_time), "dd MMM yyyy hh:mm a");
          const extra = conflicts.length > 1 ? ` (+${conflicts.length - 1} more conflict${conflicts.length - 1 === 1 ? "" : "s"})` : "";
          throw new Error(
            `This doctor already has an appointment on ${when}${first.hit.patient_name ? ` with ${first.hit.patient_name}` : ""}. Please pick a different slot.${extra}`,
          );
        }
      }

      if (wasRecurring) {
        const dates = generateRecurringDates(startDate, recurrencePattern, recurrenceEndDate!);
        const savedReasons = buildConsultationReasonsForSave(consultationReasons, othersAestheticText, othersClinicalText);
        const rows = dates.map((d) => ({
          patient_id: patientId || null,
          patient_name: patientName,
          staff_id: staffId || null,
          service: serviceName,
          status: appointmentStatus,
          visit_status: visitStatus || null,
          start_time: buildDateTime(d, startTime).toISOString(),
          end_time: buildDateTime(d, endTime).toISOString(),
          is_recurring: true,
          recurrence_pattern: recurrencePattern,
          recurrence_end_date: format(recurrenceEndDate!, "yyyy-MM-dd"),
          source: patientSource,
          problem_area_ids: selectedProblemAreas,
          appointment_type: appointmentType,
          consultation_type: consultationType || null,
          consultation_reasons: savedReasons,
        }));
        const { error } = await supabase.from("appointments").insert(rows as any);
        if (error) throw error;
      } else {
        const savedReasons = buildConsultationReasonsForSave(consultationReasons, othersAestheticText, othersClinicalText);
        const { data: inserted, error } = await supabase.from("appointments").insert({
          patient_id: patientId || null,
          patient_name: patientName,
          staff_id: staffId || null,
          service: serviceName,
          status: appointmentStatus,
          visit_status: visitStatus || null,
          start_time: startDT.toISOString(),
          end_time: buildDateTime(startDate, endTime).toISOString(),
          is_recurring: false,
          source: patientSource,
          problem_area_ids: selectedProblemAreas,
          appointment_type: appointmentType,
          consultation_type: consultationType || null,
          consultation_reasons: savedReasons,
        } as any).select("id").single();
        if (error) throw error;
        newAppointmentId = (inserted as any)?.id || null;
      }
      return {
        wasRecurring,
        capturedPatientId: patientId,
        capturedServiceName: serviceName,
        phone: patient?.phone,
        patientName,
        patientGender: (patient as any)?.gender || null,
        firstStartDT: startDT,
        recurrencePattern,
        recurrenceEndDate: wasRecurring ? recurrenceEndDate : null,
        totalSessions: wasRecurring
          ? generateRecurringDates(startDate, recurrencePattern, recurrenceEndDate!).length
          : 1,
        capturedStatus: appointmentStatus,
        newAppointmentId,
        assignSurveyTemplateId,
        fillNowSurveyTemplateId,
      };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment(s) created");
      if (data.phone) toast.info(`Patient phone: ${data.phone}`, { duration: 6000 });
      // Only a Confirmed appointment is worth messaging a patient about. Bookings
      // default to Reserved, which is a provisional hold - confirming it later goes
      // through the status-change path below, which sends the same template.
      if (data.phone && data.patientName && data.firstStartDT && data.capturedStatus === "Confirmed") {
        if (data.wasRecurring && data.recurrenceEndDate) {
          supabase.functions
            .invoke("send-recurring-appointment-whatsapp", {
              body: {
                phone: data.phone,
                patientName: data.patientName,
                firstAppointmentDate: format(data.firstStartDT, "dd MMM yyyy"),
                startTime: format(data.firstStartDT, "hh:mm a"),
                totalSessions: data.totalSessions,
                repeatPattern: data.recurrencePattern,
                endDate: format(data.recurrenceEndDate, "dd MMM yyyy"),
              },
            })
            .then(({ error }) => {
              if (error) {
                console.error("Recurring WhatsApp send failed:", error);
              } else {
                toast.success("WhatsApp confirmation sent");
              }
            });
        } else {
          supabase.functions
            .invoke("send-appointment-whatsapp", {
              body: {
                phone: data.phone,
                patientName: data.patientName,
                appointmentDate: format(data.firstStartDT, "dd MMM yyyy"),
                appointmentTime: format(data.firstStartDT, "hh:mm a"),
                serviceName: data.capturedServiceName,
                patientGender: data.patientGender,
              },
            })
            .then(({ error }) => {
              if (error) {
                console.error("WhatsApp send failed:", error);
              } else {
                toast.success("WhatsApp confirmation sent");
              }
            });
        }
      }
      // Survey: assign-to-patient (WhatsApp invite)
      if (data.assignSurveyTemplateId && data.capturedPatientId) {
        const tpl = activeSurveyTemplates.find((t: any) => t.id === data.assignSurveyTemplateId);
        // Create a pending survey assignment so it shows in the patient portal
        (async () => {
          const { data: existing } = await supabase
            .from("survey_assignments")
            .select("id")
            .eq("patient_id", data.capturedPatientId)
            .eq("template_id", data.assignSurveyTemplateId)
            .eq("status", "pending")
            .maybeSingle();
          if (!existing) {
            await supabase.from("survey_assignments").insert({
              patient_id: data.capturedPatientId,
              template_id: data.assignSurveyTemplateId,
              status: "pending",
            });
          }
        })().catch((e) => console.error("Survey assignment insert failed:", e));
        supabase.functions
          .invoke("send-survey-whatsapp", {
            body: {
              patient_id: data.capturedPatientId,
              template_name: tpl?.name || "Survey",
            },
          })
          .then(({ error }) => {
            if (error) console.error("Survey WhatsApp send failed:", error);
            else toast.success("Survey link sent on WhatsApp");
          });
      }
      // Survey: fill now (only for non-recurring single appointment)
      if (
        data.fillNowSurveyTemplateId &&
        data.capturedPatientId &&
        data.newAppointmentId &&
        !data.wasRecurring
      ) {
        setPendingFillNow({
          templateId: data.fillNowSurveyTemplateId,
          appointmentId: data.newAppointmentId,
          patientId: data.capturedPatientId,
        });
      }
      resetForm();
      setOpen(false);
      if (data.wasRecurring) {
        setLastCreatedPatientId(data.capturedPatientId);
        setLastCreatedService(data.capturedServiceName);
        setShowBillingPrompt(true);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { id, __notify, ...updates } = data;
      const { error } = await supabase.from("appointments").update(updates as any).eq("id", id);
      if (error) throw error;
      // WhatsApp notification on inline status change
      try {
        if (__notify) {
          const { phone, patientName, prevStatus, newStatus, startTime, serviceName } = __notify;
          const notifyStatuses = ["Confirmed", "Cancelled"];
          const changed = newStatus !== prevStatus && notifyStatuses.includes(newStatus);
          console.log("[appt-notify-inline] check", { phone, prevStatus, newStatus });
          if (phone && changed) {
            const startDate = new Date(startTime);
            const apptDate = format(startDate, "dd MMM yyyy");
            const apptTime = format(startDate, "hh:mm a");
            if (newStatus === "Cancelled") {
              await supabase.functions.invoke("send-appointment-update-whatsapp", {
                body: { kind: "cancelled", phone, patientName, appointmentDate: apptDate, appointmentTime: apptTime },
              });
              toast.success("WhatsApp cancellation sent");
            } else if (newStatus === "Confirmed") {
              // Confirming sends the booking-confirmation template, not the update one.
              // The update template renders only the time (its {{2}} is the time alone)
              // and carries no quick-reply buttons, so a confirmation sent through it
              // reached the patient without a date and without Confirm/Modify/Cancel.
              await supabase.functions.invoke("send-appointment-whatsapp", {
                body: { phone, patientName, appointmentDate: apptDate, appointmentTime: apptTime, serviceName: serviceName || "-", patientGender: __notify.patientGender || null },
              });
              toast.success("WhatsApp notification sent");
            }
          }
        }
      } catch (e) {
        console.error("[appt-notify-inline] error", e);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Soft delete from the list row. The label is what the Trash screen shows for the
  // entry, so pass the one the row already built rather than leaving it bare.
  const deleteAppointmentMutation = useMutation({
    mutationFn: async (target: { id: string; label: string }) => {
      await moveToTrash("appointments", target.id, target.label);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment moved to Trash");
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rescheduleAppointment = useMutation({
    mutationFn: async ({ id, newStart, newEnd }: { id: string; newStart: string; newEnd: string }) => {
      const { error } = await supabase.from("appointments").update({ start_time: newStart, end_time: newEnd }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      toast.success("Appointment rescheduled");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetForm = () => {
    setPatientId("");
    setStaffId("");
    setServiceId("");
    setAppointmentStatus("Reserved");
    setVisitStatus("");
    setConsultationType("");
    setConsultationReasons([]);
    setOthersAestheticText("");
    setOthersClinicalText("");
    setAdditionalInfoOpen(false);
    setAppointmentType("Walk-in");
    setStartDate(undefined);
    setStartTime("09:00");
    setEndTime("09:15");
    setIsRecurring(false);
    setRecurrencePattern("weekly");
    setRecurrenceEndDate(undefined);
    setSelectedProblemAreas([]);
    setAssignSurveyTemplateId("");
    setFillNowSurveyTemplateId("");
    setAutoSurveyName(null);
  };

  // Calendar navigation
  const getWeekDates = () => {
    const start = new Date(currentDate);
    start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start);
      d.setDate(d.getDate() + i);
      return d;
    });
  };

  const navigateWeek = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir * 7);
    setCurrentDate(d);
  };

  const navigateDay = (dir: number) => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + dir);
    setCurrentDate(d);
  };

  const navigateMonth = (dir: number) => {
    const d = new Date(currentDate);
    d.setMonth(d.getMonth() + dir);
    setCurrentDate(d);
  };

  const weekDates = getWeekDates();
  const currentDay = currentDate.getDay();

  // Month view helpers
  const getMonthDays = () => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart);
    const calEnd = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: calStart, end: calEnd });
  };

  const getApptsForDate = (date: Date) => {
    return filteredAppointments.filter((a: any) => isSameDay(new Date(a.start_time), date));
  };

  const getApptsForSlot = (date: Date, hour: number, minute: number) => {
    return filteredAppointments.filter((a: any) => {
      const start = new Date(a.start_time);
      return start.toDateString() === date.toDateString() && start.getHours() === hour && start.getMinutes() >= minute && start.getMinutes() < minute + 15;
    });
  };

  // Doctor color map
  const doctorColorMap = useMemo(() => {
    const map = new Map<string, typeof DOCTOR_PALETTE[0]>();
    const uniqueStaffIds = [...new Set(appointments.map((a: any) => a.staff_id).filter(Boolean))];
    uniqueStaffIds.forEach((id, i) => {
      map.set(id as string, DOCTOR_PALETTE[i % DOCTOR_PALETTE.length]);
    });
    return map;
  }, [appointments]);

  const colorForApt = (apt: any) => {
    return STATUS_CARD_CLASSES[apt.status] || STATUS_CARD_CLASSES.Proposed;
  };

  const getDoctorName = (apt: any) => {
    return apt.staff_id ? (staffMap.get(apt.staff_id) || "") : "";
  };

  const statusColor = (status: string) => {
    return STATUS_BADGE_CLASSES[status] || STATUS_BADGE_CLASSES.Proposed;
  };

  const disablePastDates = (date: Date) => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return date < todayStart;
  };

  // Drag handlers
  const handleDragStart = (e: React.DragEvent, apt: any) => {
    e.stopPropagation();
    dragRef.current = { aptId: apt.id, originalStart: apt.start_time, originalEnd: apt.end_time };
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", apt.id);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDropOnSlot = (e: React.DragEvent, targetDate: Date, targetHour: number, targetMinute: number = 0) => {
    e.preventDefault();
    if (!dragRef.current) return;
    const { aptId, originalStart, originalEnd } = dragRef.current;
    const origStart = new Date(originalStart);
    const origEnd = new Date(originalEnd);
    const durationMs = origEnd.getTime() - origStart.getTime();
    const newStart = new Date(targetDate);
    newStart.setHours(targetHour, targetMinute, 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    if (newStart < new Date()) {
      toast.error("Cannot move to past");
      dragRef.current = null;
      return;
    }
    rescheduleAppointment.mutate({ id: aptId, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() });
    dragRef.current = null;
  };

  const handleDropOnDate = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    if (!dragRef.current) return;
    const { aptId, originalStart, originalEnd } = dragRef.current;
    const origStart = new Date(originalStart);
    const origEnd = new Date(originalEnd);
    const durationMs = origEnd.getTime() - origStart.getTime();
    const newStart = new Date(targetDate);
    newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0);
    const newEnd = new Date(newStart.getTime() + durationMs);
    if (newStart < new Date()) {
      toast.error("Cannot move to past");
      dragRef.current = null;
      return;
    }
    rescheduleAppointment.mutate({ id: aptId, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() });
    dragRef.current = null;
  };

  // Drag-to-select handlers for multi-slot appointment creation
  const handleSlotMouseDown = (date: Date, slotIndex: number) => {
    dragSelectRef.current = { date, startSlotIndex: slotIndex };
    setDragSelectEnd(slotIndex);
    setIsDragSelecting(true);
  };

  const handleSlotMouseEnter = (date: Date, slotIndex: number) => {
    if (!isDragSelecting || !dragSelectRef.current) return;
    if (date.toDateString() === dragSelectRef.current.date.toDateString()) {
      setDragSelectEnd(slotIndex);
    }
  };

  const handleSlotMouseUp = () => {
    if (!isDragSelecting || !dragSelectRef.current || dragSelectEnd === null) {
      setIsDragSelecting(false);
      dragSelectRef.current = null;
      setDragSelectEnd(null);
      return;
    }
    const { date, startSlotIndex } = dragSelectRef.current;
    const minSlot = Math.min(startSlotIndex, dragSelectEnd);
    const maxSlot = Math.max(startSlotIndex, dragSelectEnd);
    const startSlot = slots[minSlot];
    const endSlot = slots[Math.min(maxSlot + 1, slots.length - 1)];
    const d = new Date(date);
    d.setHours(startSlot.hour, startSlot.minute, 0, 0);
    if (d < new Date()) { toast.error("Cannot book in the past"); } else {
      setStartDate(d);
      setStartTime(`${String(startSlot.hour).padStart(2, "0")}:${String(startSlot.minute).padStart(2, "0")}`);
      const endH = maxSlot + 1 < slots.length ? slots[maxSlot + 1].hour : 20;
      const endM = maxSlot + 1 < slots.length ? slots[maxSlot + 1].minute : 0;
      setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
      if (filterDoctors.size === 1) setStaffId(Array.from(filterDoctors)[0]);
      setOpen(true);
    }
    setIsDragSelecting(false);
    dragSelectRef.current = null;
    setDragSelectEnd(null);
  };

  const isSlotInDragRange = (date: Date, slotIndex: number) => {
    if (!isDragSelecting || !dragSelectRef.current || dragSelectEnd === null) return false;
    if (date.toDateString() !== dragSelectRef.current.date.toDateString()) return false;
    const min = Math.min(dragSelectRef.current.startSlotIndex, dragSelectEnd);
    const max = Math.max(dragSelectRef.current.startSlotIndex, dragSelectEnd);
    return slotIndex >= min && slotIndex <= max;
  };

  const navigate = (dir: number) => {
    if (view === "week") navigateWeek(dir);
    else if (view === "day") navigateDay(dir);
    else if (view === "month") navigateMonth(dir);
  };

  const monthDays = getMonthDays();

  // Dates that have appointments for mini calendar highlighting
  const appointmentDates = useMemo(() => {
    const dates: Date[] = [];
    filteredAppointments.forEach((a: any) => {
      dates.push(new Date(a.start_time));
    });
    return dates;
  }, [filteredAppointments]);

  const formatSlotTime = (hour: number, minute: number) => {
    const h = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
    const ampm = hour >= 12 ? "PM" : "AM";
    return `${h}:${String(minute).padStart(2, "0")} ${ampm}`;
  };

  // Appointment card for calendar views — shows patient name + doctor name, no time
  const AptCard = ({ apt, compact = false }: { apt: any; compact?: boolean }) => (
    <div
      draggable
      onDragStart={(e) => handleDragStart(e, apt)}
      className={cn(
        "rounded-md border cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity",
        colorForApt(apt),
        compact ? "px-1.5 py-0.5 text-[10px]" : "p-2 text-xs mb-1"
      )}
      onMouseDown={(e) => { e.stopPropagation(); }}
      onClick={(e) => { e.stopPropagation(); setOpenModal("appointmentDetail", apt.id); }}
    >
      <p className="font-medium truncate">{apt.patient_name || apt.patients?.first_name || "—"}</p>
      {!compact && <p className="opacity-70 truncate">{apt.service}</p>}
      {getDoctorName(apt) && (
        <p className={cn("truncate", compact ? "opacity-70" : "opacity-70 mt-0.5")}>
          {getDoctorName(apt)}
        </p>
      )}
      {!compact && (
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] px-1.5 py-0 mt-1 mr-1",
            (apt.appointment_type || "Walk-in") === "Online"
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-muted text-muted-foreground"
          )}
        >
          {apt.appointment_type || "Walk-in"}
        </Badge>
      )}
      {!compact && apt.is_recurring && (
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 mt-1"><Repeat className="h-2.5 w-2.5 mr-0.5" />Recurring</Badge>
      )}
    </div>
  );

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 md:gap-4">
        <div>
          <h1 className="page-title">Appointments</h1>
          <p className="page-subtitle hidden sm:block">Calendar view of all scheduled appointments</p>
        </div>
        <div className="flex items-center gap-2 md:gap-3 flex-wrap">
          <div className="flex bg-muted rounded-lg p-0.5 md:p-1">
            <Button variant={view === "day" ? "default" : "ghost"} size="sm" onClick={() => setView("day")} className="text-xs h-7 md:h-8 px-2 md:px-3">Day</Button>
            <Button variant={view === "week" ? "default" : "ghost"} size="sm" onClick={() => setView("week")} className="text-xs h-7 md:h-8 px-2 md:px-3">Week</Button>
            <Button variant={view === "month" ? "default" : "ghost"} size="sm" onClick={() => setView("month")} className="text-xs h-7 md:h-8 px-2 md:px-3">Month</Button>
            <Button variant={view === "table" ? "default" : "ghost"} size="sm" onClick={() => setView("table")} className="text-xs h-7 md:h-8 px-2 md:px-3 gap-1"><List className="h-3 w-3" />List</Button>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 md:h-9 md:w-9 relative"
            title="Filters & Search"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4" />
            {(searchQuery || filterDoctors.size > 0 || datePreset !== "this_week" || filterStatus !== "all" || filterVisitStatus !== "all") && (
              <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-primary" />
            )}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8 md:h-9 md:w-9"
            title="Print this list"
            disabled={printing}
            onClick={handlePrint}
          >
            <Printer className="h-4 w-4" />
          </Button>
          <SalesforceSyncButton />
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLockPatient(false); }}>
            <DialogTrigger asChild>
              <Button className="gap-2 h-8 md:h-9 text-xs md:text-sm"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span> Appt</Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto mx-2 sm:mx-auto">
              <DialogHeader>
                <DialogTitle className="font-display flex items-center justify-between gap-2">
                  <span>New Appointment</span>
                  <span className="flex items-center gap-2">
                    <MicButton
                      mode="replace"
                      onChange={() => { /* handled via onTranscript */ }}
                      onTranscript={async (transcript) => {
                        try {
                          toast.loading("Understanding voice…", { id: "voice-fill" });
                          const { data, error } = await supabase.functions.invoke("voice-parse-appointment", {
                            body: {
                              transcript,
                              patients: patients.map((p: any) => ({ id: p.id, name: `${p.first_name} ${p.last_name}`.trim(), phone: p.phone })),
                              services: services.map((s: any) => ({ id: s.id, name: s.name })),
                              today: format(new Date(), "yyyy-MM-dd"),
                            },
                          });
                          if (error) throw error;
                          const filled: string[] = [];
                          const missed: string[] = [];
                          if (data?.patient_id) { setPatientId(data.patient_id); filled.push("patient"); }
                          else if (data?.patient_query) missed.push(`patient "${data.patient_query}"`);
                          if (data?.service_id) { setServiceId(data.service_id); filled.push("service"); }
                          else if (data?.service_query) missed.push(`service "${data.service_query}"`);
                          if (data?.date) {
                            const d = new Date(data.date + "T00:00:00");
                            if (!isNaN(d.getTime())) { setStartDate(d); filled.push("date"); }
                          }
                          if (data?.time && /^\d{2}:\d{2}$/.test(data.time)) {
                            setStartTime(data.time);
                            const [h, m] = data.time.split(":").map(Number);
                            const end = new Date(); end.setHours(h, m + 15);
                            setEndTime(`${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`);
                            filled.push("time");
                          }
                          toast.dismiss("voice-fill");
                          if (filled.length) toast.success(`Filled: ${filled.join(", ")}`);
                          if (missed.length) toast.warning(`Could not match: ${missed.join(", ")}`);
                          if (!filled.length && !missed.length) toast.error("Could not understand the transcript");
                        } catch (e: any) {
                          toast.dismiss("voice-fill");
                          toast.error(e?.message || "Voice fill failed");
                        }
                      }}
                      title="Voice fill — speak patient, date, time, service"
                    />
                    <span className="text-xs text-muted-foreground font-normal">Voice fill</span>
                  </span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                  <div>
                    <Label>Patient</Label>
                    <PatientCombobox
                      value={patientId}
                      onValueChange={setPatientId}
                      placeholder="Select patient"
                      className="mt-1.5"
                      withSource
                      disabled={lockPatient}
                    />
                    {patientId && (() => {
                      const p = patients.find(pt => pt.id === patientId);
                      return p?.phone ? (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {p.phone}
                        </p>
                      ) : null;
                    })()}
                  </div>
                  <div>
                    <Label>Appointment Type</Label>
                    <div className="mt-1.5 inline-flex rounded-md border bg-background p-0.5 w-full">
                      {(["Walk-in", "Online"] as const).map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setAppointmentType(t)}
                          className={cn(
                            "flex-1 text-xs h-8 rounded-sm font-medium transition-colors",
                            appointmentType === t
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <Label>Doctor</Label>
                    <Select value={staffId} onValueChange={setStaffId}>
                      <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select doctor" /></SelectTrigger>
                      <SelectContent className="max-h-72">
                        {doctorsList.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[11px]">Doctors</SelectLabel>
                            {doctorsList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                          </SelectGroup>
                        )}
                        {otherStaffList.length > 0 && (
                          <SelectGroup>
                            <SelectLabel className="text-[11px]">Other staff</SelectLabel>
                            {otherStaffList.map((d: any) => (
                              <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}{d.role ? ` · ${d.role}` : ""}</SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label>Status</Label>
                    <Select value={appointmentStatus} onValueChange={setAppointmentStatus}>
                      <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  {/* Next visit is derived from the procedure's visit type, so it is hidden while creating a new appointment. */}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                    <div>
                      <Label>Service</Label>
                      <Select value={serviceId} onValueChange={setServiceId}>
                        <SelectTrigger className="mt-1.5"><SelectValue placeholder="Select service" /></SelectTrigger>
                        <SelectContent>
                          {services.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Primary Concern */}
                    <div>
                  <Label className="flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" /> Primary Concern
                  </Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className={cn("w-full mt-1.5 justify-start text-left font-normal", selectedProblemAreas.length === 0 && "text-muted-foreground")}>
                        {selectedProblemAreas.length === 0
                          ? "Select primary concerns"
                          : `${selectedProblemAreas.length} selected`}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-2 max-h-60 overflow-y-auto" align="start">
                      <div className="space-y-1">
                        {problemAreasList.map((pa: any) => (
                          <label key={pa.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-muted cursor-pointer text-sm">
                            <Checkbox
                              checked={selectedProblemAreas.includes(pa.id)}
                              onCheckedChange={(checked) => {
                                setSelectedProblemAreas(prev =>
                                  checked ? [...prev, pa.id] : prev.filter(id => id !== pa.id)
                                );
                              }}
                            />
                            {pa.name}
                          </label>
                        ))}
                        {problemAreasList.length === 0 && (
                          <p className="text-xs text-muted-foreground p-2">No primary concerns defined</p>
                        )}
                      </div>
                    </PopoverContent>
                  </Popover>
                  {selectedProblemAreas.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {selectedProblemAreas.map(id => {
                        const pa = problemAreasList.find((p: any) => p.id === id);
                        return pa ? (
                          <Badge key={id} variant="secondary" className="text-xs gap-1">
                            {pa.name}
                            <X className="h-3 w-3 cursor-pointer" onClick={() => setSelectedProblemAreas(prev => prev.filter(i => i !== id))} />
                          </Badge>
                        ) : null;
                      })}
                    </div>
                  )}
                    </div>
                </div>

                {/* Consultation Type & Reasons */}
                <div>
                  <ConsultationReasonPicker
                    consultationType={consultationType}
                    onConsultationTypeChange={setConsultationType}
                    consultationReasons={consultationReasons}
                    onConsultationReasonsChange={setConsultationReasons}
                    othersAestheticText={othersAestheticText}
                    setOthersAestheticText={setOthersAestheticText}
                    othersClinicalText={othersClinicalText}
                    setOthersClinicalText={setOthersClinicalText}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Date *</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full mt-1.5 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">{startDate ? format(startDate, "PP") : "Pick a date"}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={startDate} onSelect={setStartDate} disabled={disablePastDates} initialFocus className={cn("p-3 pointer-events-auto")} />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <Label>Start Time *</Label>
                    <TimePicker12h
                      className="mt-1.5"
                      value={startTime}
                      onChange={(v) => {
                        setStartTime(v);
                        const [h, m] = v.split(":").map(Number);
                        if (!Number.isNaN(h) && !Number.isNaN(m)) {
                          const total = (h * 60 + m + 15) % (24 * 60);
                          setEndTime(`${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`);
                        }
                      }}
                    />
                  </div>
                  <div>
                    <Label>End Time *</Label>
                    <TimePicker12h className="mt-1.5" value={endTime} onChange={setEndTime} />
                  </div>
                </div>

                <div className="border-t pt-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-muted-foreground" />
                      <Label className="font-display font-semibold">Recurring Appointment</Label>
                    </div>
                    <Switch checked={isRecurring} onCheckedChange={setIsRecurring} />
                  </div>
                  {isRecurring && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-4 space-y-4 overflow-hidden">
                      <div>
                        <Label>Repeat Pattern</Label>
                        <Select value={recurrencePattern} onValueChange={setRecurrencePattern}>
                          <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="weekly">Weekly</SelectItem>
                            <SelectItem value="biweekly">Biweekly</SelectItem>
                            <SelectItem value="monthly">Monthly</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Repeat Until *</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className={cn("w-full mt-1.5 justify-start text-left font-normal", !recurrenceEndDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {recurrenceEndDate ? format(recurrenceEndDate, "PPP") : "Select end date"}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar mode="single" selected={recurrenceEndDate} onSelect={setRecurrenceEndDate} disabled={(date) => date < (startDate || new Date())} initialFocus className={cn("p-3 pointer-events-auto")} />
                          </PopoverContent>
                        </Popover>
                      </div>
                      {startDate && recurrenceEndDate && (
                        <div className="bg-muted/50 rounded-lg p-3">
                          <p className="text-xs font-medium text-muted-foreground mb-1">Preview</p>
                          <p className="text-sm">
                            {generateRecurringDates(startDate, recurrencePattern, recurrenceEndDate).length} appointments
                            <span className="text-muted-foreground"> ({recurrencePattern}, {format(startDate, "MMM d")} to {format(recurrenceEndDate, "MMM d, yyyy")})</span>
                          </p>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Survey (optional) */}
                <div className="rounded-md border bg-muted/20 p-3 space-y-3">
                  <Label className="flex items-center gap-1.5">
                    <ClipboardCheck className="h-3.5 w-3.5" /> Survey <span className="text-xs font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  {autoSurveyName && (assignSurveyTemplateId || fillNowSurveyTemplateId) && (
                    <p className="text-xs text-primary">
                      Suggested from the selected service / primary concern: <span className="font-medium">{autoSurveyName}</span>
                    </p>
                  )}
                  {(() => {
                    const selectedTemplateId = assignSurveyTemplateId || fillNowSurveyTemplateId || "";
                    const setSelectedTemplate = (id: string) => {
                      // Keep both state slots in sync with the picker; the actual
                      // action (send link vs fill now) is decided by the buttons below.
                      if (assignSurveyTemplateId) setAssignSurveyTemplateId(id);
                      if (fillNowSurveyTemplateId) setFillNowSurveyTemplateId(id);
                      if (!assignSurveyTemplateId && !fillNowSurveyTemplateId) {
                        // Default to "Send Link" mode when nothing is armed yet
                        setAssignSurveyTemplateId(id);
                      }
                    };
                    const sendArmed = !!assignSurveyTemplateId;
                    const fillArmed = !!fillNowSurveyTemplateId;
                    return (
                      <>
                        <Select
                          value={selectedTemplateId || "__none__"}
                          onValueChange={(v) => {
                            if (v === "__none__") {
                              setAssignSurveyTemplateId("");
                              setFillNowSurveyTemplateId("");
                            } else {
                              setSelectedTemplate(v);
                            }
                          }}
                          disabled={!patientId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select survey template" />
                          </SelectTrigger>
                          <SelectContent className="max-h-60">
                            <SelectItem value="__none__">None</SelectItem>
                            {activeSurveyTemplates.map((t: any) => (
                              <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant={sendArmed ? "default" : "outline"}
                            className="flex-1"
                            disabled={!patientId || !selectedTemplateId || sendingSurveyLink}
                            onClick={async () => {
                              const tpl = activeSurveyTemplates.find((t: any) => t.id === selectedTemplateId);
                              if (!tpl) return;
                              setSendingSurveyLink(true);
                              const loadingId = toast.loading("Sending survey link on WhatsApp...");
                              try {
                                // Ensure a pending assignment exists so the portal shows this survey
                                const { data: existing } = await supabase
                                  .from("survey_assignments")
                                  .select("id")
                                  .eq("patient_id", patientId)
                                  .eq("template_id", selectedTemplateId)
                                  .eq("status", "pending")
                                  .maybeSingle();
                                if (!existing) {
                                  await supabase.from("survey_assignments").insert({
                                    patient_id: patientId,
                                    template_id: selectedTemplateId,
                                    status: "pending",
                                  });
                                }
                                const { data: res, error } = await supabase.functions.invoke("send-survey-whatsapp", {
                                  body: { patient_id: patientId, template_name: tpl.name },
                                });
                                if (error) throw error;
                                if (res?.success === false && res?.reason === "no_phone") {
                                  toast.error("Patient has no phone number on file", { id: loadingId });
                                } else if (res?.error) {
                                  toast.error(`Failed to send: ${res.error}`, { id: loadingId });
                                } else {
                                  toast.success("Survey link sent on WhatsApp", { id: loadingId });
                                  // Clear arming so we don't re-send on appointment create
                                  setAssignSurveyTemplateId("");
                                  setFillNowSurveyTemplateId("");
                                }
                              } catch (e: any) {
                                toast.error(`Failed to send: ${e?.message || "Unknown error"}`, { id: loadingId });
                              } finally {
                                setSendingSurveyLink(false);
                              }
                            }}
                          >
                            {sendingSurveyLink ? "Sending..." : "Send Survey Link"}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant={fillArmed ? "default" : "outline"}
                            className="flex-1"
                            disabled={!patientId || !selectedTemplateId || isRecurring}
                            onClick={() => {
                              setFillNowSurveyTemplateId(selectedTemplateId);
                              setAssignSurveyTemplateId("");
                            }}
                          >
                            Fill Now
                          </Button>
                        </div>
                        <p className="text-[11px] text-muted-foreground">
                          {!patientId
                            ? "Select a patient to enable surveys"
                            : !selectedTemplateId
                            ? "Pick a template, then choose an action"
                            : sendArmed
                            ? "WhatsApp link queued — will be sent on create"
                            : fillArmed
                            ? "Survey form will open after appointment is created"
                            : isRecurring
                            ? "Fill Now is not available for recurring appointments"
                            : ""}
                        </p>
                      </>
                    );
                  })()}
                </div>

                <Button className="w-full" onClick={() => createAppointment.mutate()} disabled={!startDate || (isRecurring && !recurrenceEndDate) || createAppointment.isPending}>
                  {createAppointment.isPending ? "Creating..." : isRecurring ? "Create Recurring Appointments" : "Create Appointment"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {view === "table" && (
        <div className="mb-4">
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
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["appointments"] })}
            display={tableDisplay}
            onDisplayChange={setTableDisplay}
            displayModes={["table", "kanban"]}
            onKanbanSettings={() => setKanbanOpen(true)}
            count={apptTotal}
            search={searchQuery}
            onSearchChange={setSearchQuery}
            itemLabel="Appointments"
            chartsOpen={viewChartsOpen}
            onToggleCharts={() => { setViewChartsOpen((o) => !o); setViewFiltersOpen(false); }}
            filtersOpen={viewFiltersOpen}
            onToggleFilters={() => { setViewFiltersOpen((o) => !o); setViewChartsOpen(false); }}
          />
        </div>
      )}

      {(viewFiltersOpen || viewChartsOpen) && (
        <Sheet open onOpenChange={(o) => { if (!o) { setViewFiltersOpen(false); setViewChartsOpen(false); } }}>
          <SheetContent side="right" className="w-full p-0 sm:max-w-md">
            {viewFiltersOpen ? (
              <ViewFiltersPanel
                view={activeView}
                canManage={!!activeView && !activeView.is_standard && activeView.owner_id === viewsUserId}
                fields={APPOINTMENT_VIEW_FIELDS}
                optionsFor={viewOptionsFor}
                onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
                onClose={() => setViewFiltersOpen(false)}
                itemLabel="appointments"
              />
            ) : activeView && !activeView.is_standard ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading charts…</div>}>
                <ViewChartsPanel
                  charts={activeView.charts ?? []}
                  rows={visibleTableRows.map((apt) => toViewRow(apt, pageInvoiceByAppointmentId))}
                  canManage={activeView.owner_id === viewsUserId}
                  onChange={(charts) => saveCharts(activeView.id, charts)}
                  onClose={() => setViewChartsOpen(false)}
                  fields={APPOINTMENT_VIEW_FIELDS}
                  itemLabel="Appointments"
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

      {/* Collapsible Filters Bar */}
      <div className={showFilters ? "mb-4" : ""}>
        {showFilters && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="flex flex-wrap items-center gap-3 p-3 bg-muted/30 rounded-lg border overflow-hidden">
            <div className="relative flex-1 min-w-[180px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search patient name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 h-9 text-sm" />
            </div>
            <div className="flex items-center">
              <Select value={filterDoctors.size === 0 ? "all" : filterDoctors.size === 1 ? [...filterDoctors][0] : "multi"} onValueChange={(v) => {
                if (v === "all") setFilterDoctors(new Set());
                else setFilterDoctors(new Set([v]));
              }}>
                <SelectTrigger className="w-[170px] h-9 text-sm rounded-r-none"><SelectValue placeholder="All Doctors" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Doctors</SelectItem>
                  {doctorsList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <PinButton pinKey="doctor" value={filterDoctors.size === 1 ? [...filterDoctors][0] : ""} label="doctor filter" />
            </div>

            <div className="flex items-center">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[140px] h-9 text-sm rounded-r-none"><SelectValue placeholder="All Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <PinButton pinKey="status" value={filterStatus} label="status filter" />
            </div>

            <div className="flex items-center">
              <Select value={filterVisitStatus} onValueChange={setFilterVisitStatus}>
                <SelectTrigger className="w-[160px] h-9 text-sm rounded-r-none"><SelectValue placeholder="All Next Visits" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Next Visits</SelectItem>
                  {visitStatusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              <PinButton pinKey="visit" value={filterVisitStatus} label="next visit filter" />
            </div>

            <div className="flex items-center">
              <Select value={datePreset} onValueChange={setDatePreset}>
                <SelectTrigger className="w-[160px] h-9 text-sm rounded-r-none"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DATE_PRESETS.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <PinButton pinKey="date" value={datePreset} label="date filter" />
            </div>

            {datePreset === "specific" && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-2", specificDate && "border-primary text-primary")}>
                    <CalendarIcon className="h-4 w-4" />
                    {specificDate ? format(specificDate, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={specificDate} onSelect={setSpecificDate} initialFocus className={cn("p-3 pointer-events-auto")} />
                </PopoverContent>
              </Popover>
            )}

            {datePreset === "range" && (
              <>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-2", rangeFrom && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                      {rangeFrom ? format(rangeFrom, "MMM d, yyyy") : "From"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={rangeFrom} onSelect={setRangeFrom} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-2", rangeTo && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                      {rangeTo ? format(rangeTo, "MMM d, yyyy") : "To"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={rangeTo} onSelect={setRangeTo} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </>
            )}

            {(searchQuery || filterDoctors.size > 0 || datePreset !== "this_week" || filterStatus !== "all" || filterVisitStatus !== "all") && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => { setSearchQuery(""); setFilterDoctors(new Set()); setFilterStatus("all"); setFilterVisitStatus("all"); setDatePreset("this_week"); setSpecificDate(undefined); setRangeFrom(undefined); setRangeTo(undefined); }}>Clear filters</Button>
            )}
            <span className="text-xs text-muted-foreground ml-auto">{(view === "table" ? apptTotal : filteredAppointments.length).toLocaleString()} appointment{(view === "table" ? apptTotal : filteredAppointments.length) !== 1 ? "s" : ""}</span>
          </motion.div>
        )}
        {/* Status color legend (click to filter by status) */}
        {view !== "table" && (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
            {statusOptions.map((s) => {
              const isSelected = filterStatus === s;
              const isFiltering = filterStatus !== "all";
              return (
                <button
                  key={s}
                  className={cn(
                    "flex items-center gap-1.5 text-xs px-2 py-1 rounded-full border transition-all cursor-pointer",
                    isSelected
                      ? `${badgeClasses(s)} font-medium`
                      : isFiltering
                        ? "border-transparent text-muted-foreground/50 hover:text-muted-foreground"
                        : "border-transparent text-muted-foreground hover:bg-muted"
                  )}
                  onClick={() => setFilterStatus(prev => prev === s ? "all" : s)}
                >
                  <span className={cn("w-2.5 h-2.5 rounded-full", badgeClasses(s).split(" ")[0].replace("/15", ""))} />
                  {s}
                </button>
              );
            })}
            {filterStatus !== "all" && (
              <button className="text-[10px] text-muted-foreground hover:text-foreground ml-1" onClick={() => setFilterStatus("all")}>
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Calendar / Table area */}
      <div className="flex gap-4">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="data-table flex-1 min-w-0">
          {view !== "table" && (
            <div className="p-4 border-b flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(-1)}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="ghost" className="font-display font-semibold text-base hover:bg-muted/50 gap-1.5 px-2">
                      {view === "month"
                        ? format(currentDate, "MMMM yyyy")
                        : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={currentDate}
                      onSelect={(date) => { if (date) setCurrentDate(date); }}
                      modifiers={{ hasAppointment: appointmentDates }}
                      modifiersClassNames={{ hasAppointment: "bg-primary/20 font-bold" }}
                      className={cn("p-3 pointer-events-auto")}
                    />
                  </PopoverContent>
                </Popover>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate(1)}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <Button variant="outline" size="sm" className="text-xs" onClick={() => setCurrentDate(new Date())}>
                Today
              </Button>
            </div>
          )}

          <div className="overflow-x-auto">
            {view === "table" ? (
              /* TABLE VIEW */
              <div>
                {/* Quick date filters */}
                <div className="p-3 border-b flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground font-medium mr-1">Quick:</span>
                  {DATE_PRESETS.filter((p) => p.key !== "specific").map((f) => (
                    f.key === "range" ? (
                      <Popover key={f.key} open={rangePopoverOpen} onOpenChange={setRangePopoverOpen}>
                        <PopoverTrigger asChild>
                          <Button
                            variant={datePreset === f.key ? "default" : "outline"}
                            size="sm"
                            className="h-7 text-xs px-3"
                            onClick={() => {
                              setDatePreset(f.key);
                              setRangePopoverOpen(true);
                            }}
                          >
                            {f.label}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-4" align="start">
                          <div className="space-y-3">
                            <div>
                              <Label className="text-xs font-medium mb-2 block">
                                {rangeCalendarMode === "from" ? "From Date" : "To Date"}
                              </Label>
                              <Calendar
                                mode="single"
                                selected={rangeCalendarMode === "from" ? rangeFrom : rangeTo}
                                onSelect={(date) => {
                                  if (rangeCalendarMode === "from") {
                                    setRangeFrom(date);
                                    setRangeCalendarMode("to");
                                  } else {
                                    setRangeTo(date);
                                    setRangePopoverOpen(false);
                                    setRangeCalendarMode("from");
                                  }
                                }}
                                className="rounded-md border"
                              />
                            </div>
                            {rangeCalendarMode === "to" && (
                              <div className="text-xs text-muted-foreground text-center pt-2 border-t">
                                <p>From: {rangeFrom ? format(rangeFrom, "MMM d, yyyy") : "Not set"}</p>
                              </div>
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    ) : (
                      <Button
                        key={f.key}
                        variant={datePreset === f.key ? "default" : "outline"}
                        size="sm"
                        className="h-7 text-xs px-3"
                        onClick={() => setDatePreset(f.key)}
                      >
                        {f.label}
                      </Button>
                    )
                  ))}
                  {datePreset === "range" && (rangeFrom || rangeTo) && (
                    <span className="text-xs text-muted-foreground">· {dateFilterLabel}</span>
                  )}
                  <span className="text-xs text-muted-foreground ml-auto">
                    {apptTotal.toLocaleString()} result{apptTotal !== 1 ? "s" : ""}
                    {isApptPageFetching ? " · loading…" : ""}
                  </span>
                </div>
                {tableDisplay === "kanban" ? (
                  <ListKanban
                    rows={visibleTableRows}
                    config={kanban}
                    options={kanbanOptions}
                    columns={displayColumns}
                    fields={APPOINTMENT_VIEW_FIELDS}
                    rawValue={kanbanRawValue}
                    onOpen={(row) => setOpenModal("appointmentDetail", row.id)}
                    onMove={moveKanbanCard}
                    titleField="patient"
                  />
                ) : (
                <>
                <table ref={appointmentsTableRef} className="w-full text-sm responsive-table">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {shouldShowColumn("patient") && (
                        <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("patient")}>
                          <span className="flex items-center">Patient<SortIcon column="patient" /></span>
                        </th>
                      )}
                      {shouldShowColumn("phone") && (
                        <th className="text-left p-3 font-medium text-muted-foreground">Phone</th>
                      )}
                      {shouldShowColumn("service") && (
                        <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("service")}>
                          <span className="flex items-center">Service<SortIcon column="service" /></span>
                        </th>
                      )}
                      {shouldShowColumn("doctor") && (
                        <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("doctor")}>
                          <span className="flex items-center">Doctor<SortIcon column="doctor" /></span>
                        </th>
                      )}
                      {shouldShowColumn("start_time") && (
                        <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("start_time")}>
                          <span className="flex items-center">Date<SortIcon column="start_time" /></span>
                        </th>
                      )}
                      {shouldShowColumn("time") && (
                        <th className="text-left p-3 font-medium text-muted-foreground">Time</th>
                      )}
                      {shouldShowColumn("status") && (
                        <th className="text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("status")}>
                          <span className="flex items-center">Status<SortIcon column="status" /></span>
                        </th>
                      )}
                      {shouldShowColumn("bill") && (
                        <th className="text-left p-3 font-medium text-muted-foreground" title="Not sortable across pages">
                          Bill Amount
                        </th>
                      )}
                      {shouldShowColumn("visit_status") && (
                        <th className="text-left p-3 font-medium text-muted-foreground">Next Visit</th>
                      )}
                      {shouldShowColumn("payment_mode") && (
                        <th className="text-left p-3 font-medium text-muted-foreground">Payment Mode</th>
                      )}
                      <th className="text-left p-3 font-medium text-muted-foreground w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const virtualRows = inOverlay
                        ? visibleTableRows.map((_: any, index: number) => ({ index, key: index, start: 0, end: 0 }))
                        : rowVirtualizer.getVirtualItems();
                      const totalSize = rowVirtualizer.getTotalSize();
                      const paddingTop = inOverlay || virtualRows.length === 0
                        ? 0
                        : (virtualRows[0] as any).start - tableScrollMargin;
                      const paddingBottom = inOverlay || virtualRows.length === 0
                        ? 0
                        : totalSize - ((virtualRows[virtualRows.length - 1] as any).end - tableScrollMargin);
                      const colSpan = displayColumns.length + 1;

                      return (
                        <>
                          {paddingTop > 0 && (
                            <tr><td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} /></tr>
                          )}
                          {virtualRows.map((virtualRow) => {
                            const apt = visibleTableRows[virtualRow.index];
                            if (!apt) return null;
                            const patientPhone = apt.patients?.phone || "";
                            const invoice = pageInvoiceByAppointmentId.get(apt.id);
                            const isEditing = editingRow === apt.id;

                            if (isEditing) {
                              return (
                                <tr
                                  key={apt.id}
                                  ref={rowVirtualizer.measureElement}
                                  data-index={virtualRow.index}
                                  className="border-b bg-primary/5"
                                >
                                  {shouldShowColumn("patient") && (
                                    <td className="p-2 font-medium">{apt.patient_name || (apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : "—")}</td>
                                  )}
                                  {shouldShowColumn("phone") && (
                                    <td className="p-2 text-muted-foreground text-xs">{patientPhone || "—"}</td>
                                  )}
                                  {shouldShowColumn("service") && (
                                    <td className="p-2">
                                      <Select value={editValues.service} onValueChange={(val) => setEditValues({ ...editValues, service: val })}>
                                        <SelectTrigger className="h-8 text-xs w-36"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {services.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                  )}
                                  {shouldShowColumn("doctor") && (
                                    <td className="p-2">
                                      <Select value={editValues.staff_id} onValueChange={(val) => setEditValues({ ...editValues, staff_id: val })}>
                                        <SelectTrigger className="h-8 text-xs w-36"><SelectValue placeholder="Select" /></SelectTrigger>
                                        <SelectContent>
                                          {doctorsList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                  )}
                                  {shouldShowColumn("start_time") && (
                                    <td className="p-2">
                                      <Input
                                        type="date"
                                        className="h-8 text-xs w-36"
                                        value={datePart(editValues.start_time)}
                                        onChange={(e) =>
                                          setEditValues((v: any) => ({
                                            ...v,
                                            start_time: joinDateTime(e.target.value, timePart(v.start_time)),
                                            end_time: joinDateTime(e.target.value, timePart(v.end_time)),
                                          }))
                                        }
                                      />
                                    </td>
                                  )}
                                  {shouldShowColumn("time") && (
                                    <td className="p-2">
                                      <div className="flex items-center gap-1.5">
                                        <TimePicker12h
                                          compact
                                          className="w-32"
                                          value={timePart(editValues.start_time)}
                                          onChange={(t) =>
                                            setEditValues((v: any) => ({ ...v, start_time: joinDateTime(datePart(v.start_time), t) }))
                                          }
                                        />
                                        <span className="text-xs text-muted-foreground">–</span>
                                        <TimePicker12h
                                          compact
                                          className="w-32"
                                          value={timePart(editValues.end_time)}
                                          onChange={(t) =>
                                            setEditValues((v: any) => ({ ...v, end_time: joinDateTime(datePart(v.end_time) || datePart(editValues.start_time), t) }))
                                          }
                                        />
                                      </div>
                                    </td>
                                  )}
                                  {shouldShowColumn("status") && (
                                    <td className="p-2">
                                      <Select value={editValues.status} onValueChange={(val) => setEditValues({ ...editValues, status: val })}>
                                        <SelectTrigger className="h-8 text-xs w-28"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                          {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                        </SelectContent>
                                      </Select>
                                    </td>
                                  )}
                                  {shouldShowColumn("bill") && (
                                    <td className="p-2 text-muted-foreground text-xs">{invoice ? `₹${invoice.total_amount?.toLocaleString()}` : "—"}</td>
                                  )}
                                  {shouldShowColumn("visit_status") && (
                                    <td className="p-2 text-muted-foreground text-xs">{apt.visit_status || "—"}</td>
                                  )}
                                  {shouldShowColumn("payment_mode") && (
                                    <td className="p-2 text-muted-foreground text-xs">{invoice?.payment_mode || "—"}</td>
                                  )}
                                  <td className="p-2">
                                    <div className="flex items-center gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-success" onClick={saveInlineEdit}><CheckIcon className="h-3.5 w-3.5" /></Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={cancelInlineEdit}><X className="h-3.5 w-3.5" /></Button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            return (
                              <tr
                                key={apt.id}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
                                onClick={() => setOpenModal("appointmentDetail", apt.id)}
                              >
                                {shouldShowColumn("patient") && (
                                  <td className="p-3 font-medium">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <PatientAvatar
                                        firstName={apt.patients?.first_name || (apt.patient_name || "").split(" ")[0]}
                                        lastName={apt.patients?.last_name || (apt.patient_name || "").split(" ").slice(1).join(" ")}
                                        photoUrl={apt.patient_id ? appointmentAvatars[apt.patient_id] : undefined}
                                        className="h-8 w-8"
                                      />
                                      <span className="truncate">{apt.patient_name || (apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : "—")}</span>
                                    </div>
                                  </td>
                                )}
                                {shouldShowColumn("phone") && (
                                  <td className="p-3 text-muted-foreground">
                                    {patientPhone ? <span className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" />{patientPhone}</span> : "—"}
                                  </td>
                                )}
                                {shouldShowColumn("service") && (
                                  <td className="p-3">
                                    {/* Clamped so one long value can't set the height of the whole
                                        row - imported data has put paragraphs in here. truncate
                                        needs a bounded width, and max-w on the td itself is
                                        unreliable under table layout, hence the inner block span. */}
                                    <span className="block max-w-[240px] truncate" title={apt.service || ""}>
                                      {apt.service || "—"}
                                    </span>
                                  </td>
                                )}
                                {shouldShowColumn("doctor") && (
                                  <td className="p-3 text-muted-foreground">{apt.staff_id ? (staffMap.get(apt.staff_id) || "—") : "—"}</td>
                                )}
                                {shouldShowColumn("start_time") && (
                                  <td className="p-3">
                                    <p className="font-medium whitespace-nowrap">{format(new Date(apt.start_time), "MMM d")}</p>
                                  </td>
                                )}
                                {shouldShowColumn("time") && (
                                  <td className="p-3 text-xs text-muted-foreground whitespace-nowrap">
                                    {format(new Date(apt.start_time), "h:mm a")} – {format(new Date(apt.end_time), "h:mm a")}
                                  </td>
                                )}
                                {shouldShowColumn("status") && (
                                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                    <Select value={apt.status} onValueChange={(val) => inlineUpdateMutation.mutate({
                                      id: apt.id,
                                      status: val,
                                      __notify: {
                                        phone: apt.patients?.phone || "",
                                        patientName: `${apt.patients?.first_name || ""} ${apt.patients?.last_name || ""}`.trim() || "Patient",
                                        prevStatus: apt.status,
                                        newStatus: val,
                                        startTime: apt.start_time,
                                        doctorName: apt.staff_id ? (staffMap.get(apt.staff_id) || "") : "",
                                        serviceName: apt.service || "",
                                        patientGender: apt.patients?.gender || null,
                                      },
                                    })}>
                                      <SelectTrigger className="h-7 w-28 text-xs border-0 bg-transparent p-0">
                                        <Badge className={cn("text-xs", statusColor(apt.status))}>{apt.status}</Badge>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                  </td>
                                )}
                                {shouldShowColumn("bill") && (
                                  <td className="p-3 text-xs">{invoice ? <span className="font-medium">₹{invoice.total_amount?.toLocaleString()}</span> : <span className="text-muted-foreground">—</span>}</td>
                                )}
                                {shouldShowColumn("visit_status") && (
                                  <td className="p-3 text-xs">{apt.visit_status ? <Badge variant="outline" className="text-xs">{apt.visit_status}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                                )}
                                {shouldShowColumn("payment_mode") && (
                                  <td className="p-3 text-xs">{invoice?.payment_mode ? <Badge variant="outline" className="text-xs">{invoice.payment_mode}</Badge> : <span className="text-muted-foreground">—</span>}</td>
                                )}
                                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-0.5">
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startInlineEdit(apt)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      title="Add Prescription"
                                      onClick={() => {
                                        const params = new URLSearchParams();
                                        params.set("appointment_id", apt.id);
                                        if (apt.patient_id) params.set("patient_id", apt.patient_id);
                                        if (apt.staff_id) params.set("staff_id", apt.staff_id);
                                        if (apt.service) params.set("service", apt.service);
                                        routerNavigate(`/procedures/new?${params.toString()}`);
                                      }}
                                    >
                                      <ClipboardList className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive"
                                      title="Delete appointment"
                                      onClick={() => setDeleteTarget({
                                        id: apt.id,
                                        label: `${apt.patient_name || (apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : "Appointment")} — ${format(new Date(apt.start_time), "MMM d, h:mm a")}`,
                                      })}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {paddingBottom > 0 && (
                            <tr><td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} /></tr>
                          )}
                        </>
                      );
                    })()}
                    {visibleTableRows.length === 0 && (
                      <tr><td colSpan={displayColumns.length + 1} className="p-8 text-center text-muted-foreground">No appointments found</td></tr>
                    )}
                  </tbody>
                </table>
                <div className="p-3 border-t flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    Page {apptPage} of {Math.max(1, Math.ceil(apptTotal / APPT_PAGE_SIZE))}
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-3"
                      disabled={apptPage <= 1}
                      onClick={() => setApptPage((p) => Math.max(1, p - 1))}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs px-3"
                      disabled={apptPage >= Math.ceil(apptTotal / APPT_PAGE_SIZE)}
                      onClick={() => setApptPage((p) => p + 1)}
                    >
                      Next
                    </Button>
                  </div>
                </div>
                </>
                )}
              </div>
            ) : view === "month" ? (
              /* MONTH VIEW */
              <div>
                <div className="grid grid-cols-7 border-b">
                  {daysOfWeek.map((d) => (
                    <div key={d} className="p-2 text-center text-xs font-medium text-muted-foreground border-l first:border-l-0">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7">
                  {monthDays.map((date, i) => {
                    const dayAppts = getApptsForDate(date);
                    const isCurrentMonth = isSameMonth(date, currentDate);
                    const isToday = isSameDay(date, today);
                    return (
                      <div
                        key={i}
                        className={cn(
                          "border-b border-l first:border-l-0 min-h-[100px] p-1 transition-colors cursor-pointer hover:bg-muted/20",
                          !isCurrentMonth && "bg-muted/20",
                          isToday && "bg-primary/5",
                        )}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnDate(e, date)}
                        onClick={() => {
                          const d = new Date(date);
                          d.setHours(9, 0, 0, 0);
                          if (d < new Date()) { toast.error("Cannot book in the past"); return; }
                          setStartDate(d);
                          setStartTime("09:00");
                          setEndTime("09:15");
                          if (filterDoctors.size === 1) setStaffId(Array.from(filterDoctors)[0]);
                          setOpen(true);
                        }}
                      >
                        <div className="flex items-center justify-between px-1">
                          <span
                            className={cn("text-xs font-medium cursor-pointer hover:underline", isToday ? "bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center" : !isCurrentMonth ? "text-muted-foreground/50" : "text-foreground")}
                            onClick={() => { setCurrentDate(date); setView("day"); }}
                          >
                            {date.getDate()}
                          </span>
                          {dayAppts.length > 0 && <span className="text-[10px] text-muted-foreground">{dayAppts.length}</span>}
                        </div>
                        <div className="mt-1 space-y-0.5 max-h-[80px] overflow-y-auto">
                          {dayAppts.slice(0, 3).map((apt: any) => (
                            <AptCard key={apt.id} apt={apt} compact />
                          ))}
                          {dayAppts.length > 3 && (
                            <p className="text-[10px] text-muted-foreground px-1">+{dayAppts.length - 3} more</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : view === "week" ? (
              /* WEEK VIEW — 15 min slots */
              <div className="min-w-[800px]" onMouseUp={handleSlotMouseUp} onMouseLeave={() => { if (isDragSelecting) { setIsDragSelecting(false); dragSelectRef.current = null; setDragSelectEnd(null); } }}>
                <div className="grid grid-cols-8 border-b">
                  <div className="p-3 text-xs text-muted-foreground" />
                  {weekDates.map((date, i) => {
                    const isToday = date.toDateString() === today.toDateString();
                    return (
                      <div key={i} className={cn("p-3 text-center border-l", isToday && "bg-primary/5")}>
                        <p className="text-xs text-muted-foreground">{daysOfWeek[i]}</p>
                        <p className={cn("text-lg font-display font-semibold mt-0.5", isToday && "text-primary")}>{date.getDate()}</p>
                      </div>
                    );
                  })}
                </div>
                {slots.map((slot, si) => {
                  const showLabel = slot.minute === 0;
                  return (
                    <div key={si} className={cn("grid grid-cols-8 border-b last:border-0", slot.minute === 0 ? "min-h-[18px]" : "min-h-[18px]")}>
                      <div className="p-0.5 text-[10px] text-muted-foreground text-right pr-2 pt-0.5">
                        {showLabel && formatSlotTime(slot.hour, slot.minute)}
                      </div>
                      {weekDates.map((date, dayIndex) => {
                        const dayAppts = getApptsForSlot(date, slot.hour, slot.minute);
                        const isToday = date.toDateString() === today.toDateString();
                        return (
                          <div
                            key={dayIndex}
                            className={cn(
                              "border-l p-0.5 min-h-[18px] cursor-crosshair transition-colors select-none",
                              isToday && "bg-primary/5",
                              slot.minute === 0 && "border-t",
                              isSlotInDragRange(date, si) ? "bg-primary/20" : "hover:bg-muted/30"
                            )}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDropOnSlot(e, date, slot.hour, slot.minute)}
                            onMouseDown={(e) => { e.preventDefault(); handleSlotMouseDown(date, si); }}
                            onMouseEnter={() => handleSlotMouseEnter(date, si)}
                            onClick={() => {
                              if (isDragSelecting) return;
                              const d = new Date(date);
                              d.setHours(slot.hour, slot.minute, 0, 0);
                              if (d < new Date()) { toast.error("Cannot book in the past"); return; }
                              setStartDate(d);
                              setStartTime(`${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`);
                              const endMin = slot.minute + 15;
                              const endH = endMin >= 60 ? slot.hour + 1 : slot.hour;
                              const endM = endMin >= 60 ? 0 : endMin;
                              setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
                              if (filterDoctors.size === 1) setStaffId(Array.from(filterDoctors)[0]);
                              setOpen(true);
                            }}
                          >
                            {dayAppts.map((apt: any) => (
                              <AptCard key={apt.id} apt={apt} compact />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* DAY VIEW — 15 min slots */
              <div className="min-w-[400px]" onMouseUp={handleSlotMouseUp} onMouseLeave={() => { if (isDragSelecting) { setIsDragSelecting(false); dragSelectRef.current = null; setDragSelectEnd(null); } }}>
                <div className="p-3 text-center border-b bg-primary/5">
                  <p className="text-xs text-muted-foreground">{daysOfWeek[currentDay]}</p>
                  <p className="text-2xl font-display font-bold text-primary">{currentDate.getDate()}</p>
                </div>
                {slots.map((slot, si) => {
                  const dayAppts = getApptsForSlot(currentDate, slot.hour, slot.minute);
                  const showLabel = slot.minute === 0;
                  return (
                    <div key={si} className={cn("flex", slot.minute === 0 ? "border-t" : "border-t border-dashed border-border/40", "last:border-b min-h-[36px]")}>
                      <div className="w-24 p-1 text-xs text-muted-foreground text-right shrink-0 pr-3">
                        {showLabel && formatSlotTime(slot.hour, slot.minute)}
                      </div>
                      <div
                        className={cn(
                          "flex-1 border-l p-1 space-y-0.5 cursor-crosshair transition-colors select-none",
                          isSlotInDragRange(currentDate, si) ? "bg-primary/20" : "hover:bg-muted/30"
                        )}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropOnSlot(e, currentDate, slot.hour, slot.minute)}
                        onMouseDown={(e) => { e.preventDefault(); handleSlotMouseDown(currentDate, si); }}
                        onMouseEnter={() => handleSlotMouseEnter(currentDate, si)}
                        onClick={() => {
                          if (isDragSelecting) return;
                          const d = new Date(currentDate);
                          d.setHours(slot.hour, slot.minute, 0, 0);
                          if (d < new Date()) { toast.error("Cannot book in the past"); return; }
                          setStartDate(d);
                          setStartTime(`${String(slot.hour).padStart(2, "0")}:${String(slot.minute).padStart(2, "0")}`);
                          const endMin = slot.minute + 15;
                          const endH = endMin >= 60 ? slot.hour + 1 : slot.hour;
                          const endM = endMin >= 60 ? 0 : endMin;
                          setEndTime(`${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`);
                          if (filterDoctors.size === 1) setStaffId(Array.from(filterDoctors)[0]);
                          setOpen(true);
                        }}
                      >
                        {dayAppts.map((apt: any) => (
                          <AptCard key={apt.id} apt={apt} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>

      <AppointmentDetailSheet
        appointmentId={selectedAppointmentId}
        onClose={() => setSelectedAppointmentId(null)}
      />

      <Dialog open={showBillingPrompt} onOpenChange={setShowBillingPrompt}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create Billing Plan?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Would you like to create a billing plan for these recurring appointments?</p>
          <div className="flex gap-3 justify-end pt-2">
            <Button variant="outline" onClick={() => setShowBillingPrompt(false)}>Skip</Button>
            <Button onClick={() => {
              setShowBillingPrompt(false);
              routerNavigate(`/billing?prefillPatient=${encodeURIComponent(lastCreatedPatientId)}&prefillService=${encodeURIComponent(lastCreatedService)}`);
            }}>Yes, Create Invoice</Button>
          </div>
        </DialogContent>
      </Dialog>

      {pendingFillNow && (
        <SurveyFill
          open={!!pendingFillNow}
          onOpenChange={(o) => { if (!o) setPendingFillNow(null); }}
          templateId={pendingFillNow.templateId}
          appointmentId={pendingFillNow.appointmentId}
          patientId={pendingFillNow.patientId}
          onComplete={() => setPendingFillNow(null)}
        />
      )}

      <KanbanSettingsDialog
        open={kanbanOpen}
        onOpenChange={setKanbanOpen}
        config={kanban}
        groupFields={kanbanGroupFields}
        summaryFields={kanbanSummaryFields}
        defaultGroupField="status"
        onSave={(cfg) => {
          setKanban(cfg);
          setKanbanConfig("appointments", activeView?.id ?? ALL_VIEW_ID, cfg);
          setTableDisplay("kanban");
        }}
      />

      <ViewEditorDialog
        open={viewEditorOpen}
        onOpenChange={setViewEditorOpen}
        view={editingView}
        onSave={saveView}
        fields={APPOINTMENT_VIEW_FIELDS}
        defaultColumns={DEFAULT_APPOINTMENT_VIEW_COLUMNS}
        optionsFor={viewOptionsFor}
        people={staffList
          .filter((s: any) => s.auth_user_id)
          .map((s: any) => ({ value: s.auth_user_id, label: `${s.first_name || ""} ${s.last_name || ""}`.trim() }))}
        itemLabel="appointments"
      />

      <FieldsDisplayDialog
        open={viewFieldsOpen}
        onOpenChange={setViewFieldsOpen}
        viewName={activeView?.name ?? "All Appointments"}
        columns={displayColumns}
        onSave={(cols) => {
          if (!activeView) return;
          if (activeView.is_standard) updateStandardColumns(activeView.id, cols);
          else saveView({ ...activeView, columns: cols });
        }}
        fields={APPOINTMENT_VIEW_FIELDS}
        defaultColumns={DEFAULT_APPOINTMENT_VIEW_COLUMNS}
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

      <DeleteConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}
        entity={deleteTarget ? `the appointment for ${deleteTarget.label}` : "this appointment"}
        // Billing and procedures are ON DELETE SET NULL, so they survive but come back
        // unlinked; therapy notes and feedback are ON DELETE CASCADE and do not come
        // back at all. Worth saying plainly on a clinical record.
        note="Its bills and procedures are kept but will no longer be linked to it, and any therapy notes or feedback on it are removed for good."
        onConfirm={async () => {
          if (!deleteTarget) return;
          // The mutation's onError already reports the failure.
          try { await deleteAppointmentMutation.mutateAsync(deleteTarget); } catch { /* handled */ }
        }}
      />
    </div>
  );
};

export default Appointments;
