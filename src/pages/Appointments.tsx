import {
  THERAPIST_ROLES,
  THERAPIST_FIELD_LABEL,
  therapistDisplayName,
  therapistIdsOf,
  isTherapistRole,
  type TherapistCandidate,
} from "@/lib/appointmentTherapist";
import { StaffCombobox } from "@/components/shared/StaffCombobox";
import { useAuth } from "@/hooks/useAuth";
import { canActOnModule, canViewModule } from "@/lib/staffAccess";
import { StaffMultiCombobox } from "@/components/shared/StaffMultiCombobox";
import { useStackedTable } from "@/hooks/useStackedTable";
import { resizeColumn, mergeSavedWidths, type ColumnWidth } from "@/lib/columnWidths";
import { isPageSortedColumn, sortAppointments } from "@/lib/appointmentSort";
import { usualDoctorId, type PastVisit } from "@/lib/usualDoctor";
import { appointmentDeleteNote } from "@/lib/appointmentDeleteNote";
import { displayDate } from "@/lib/dateInput";
import { ColumnResizeHandle } from "@/components/shared/ColumnResizeHandle";
import { DateInput } from "@/components/shared/DateInput";
import { CalendarPopover } from "@/components/shared/CalendarPopover";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useState, useCallback, useRef, useMemo, useEffect, lazy, Suspense } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useUrlPanel } from "@/hooks/useUrlPanel";
import { shouldOpenNewAppointment } from "@/lib/openNewAppointment";
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
import { APPOINTMENT_VIEW_FIELDS, DEFAULT_APPOINTMENT_VIEW_COLUMNS, withoutBillingFields, withoutBillingConditions } from "@/lib/listViews/appointmentFields";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import { sortForSearch } from "@/lib/appointmentSearchSort";
import { resolveViewSort } from "@/lib/listViews/viewSort";
import { viewDatePreset } from "@/lib/viewDatePreset";
import { activeAppointmentFilters, emptyAppointmentsMessage } from "@/lib/activeAppointmentFilters";
import { appointmentInvoiceMap } from "@/lib/appointmentInvoiceMap";
import { billCellState } from "@/lib/billCellState";
import { billedPatientDays, patientDayKey, type BilledDayRow } from "@/lib/billedPatientDays";
import { withUnlinkedBills, type VisitRow } from "@/lib/unlinkedVisitBills";
import { APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED } from "@/lib/whatsappNotifications";
import { confirmationSendPlan } from "@/lib/confirmationSend";
import { patientForBooking } from "@/lib/bookingPatient";
import { useLiveAppointments } from "@/hooks/useLiveAppointments";
import { edgeFunctionErrorMessage } from "@/lib/edgeFunctionError";
import {
  rescheduleVerdict,
  rescheduleWarning,
  type BookableAppointment,
  type VisitEvidence,
} from "@/lib/appointmentReschedule";
import { formatMoneyExact } from "@/lib/currency";
import {
  fetchInvoicesByAppointmentIds,
  invoiceMapByAppointment,
  type VisitBill,
  type VisitBilling,
} from "@/lib/invoicesForAppointments";
import { assertWrote } from "@/lib/rowAccess";
import { joinDateTime, hasIncompleteDateTime } from "@/lib/inlineTimeEdit";
import { ChevronLeft, ChevronRight, Plus, Clock, Repeat, CalendarIcon, List, Phone, Search, Filter, GripVertical, ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown, Pencil, Check as CheckIcon, X, AlertCircle, ClipboardCheck, ClipboardList, Pin, Printer, Trash2 } from "lucide-react";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import { moveToTrash } from "@/lib/trash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { format, addWeeks, addMonths, addDays, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isWithinInterval } from "date-fns";
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
import { investigationText } from "@/lib/investigationText";
import { PaymentModeCell } from "@/components/appointments/PaymentModeCell";
import { printAppointments } from "@/lib/printAppointments";
import { PatientCombobox } from "@/components/patients/PatientCombobox";
import { VipBadge } from "@/components/shared/VipBadge";
import { SurveyFill } from "@/components/surveys/SurveyFill";
import { MicButton } from "@/components/shared/MicButton";
import { TimePicker12h } from "@/components/shared/TimePicker12h";
import { MANUAL_APPOINTMENT_STATUSES, appointmentStatusLabel, showsAsBilled, BILLED_BADGE_CLASSES } from "@/lib/appointmentStatus";
import { QueryTimeoutNotice } from "@/components/shared/QueryTimeoutNotice";
import {
  appointmentPatientName,
  appointmentPatientIsVip,
  appointmentPatientInitials,
  appointmentPatientHaystack,
} from "@/lib/appointmentPatientName";


// Lazy: pulls in recharts, kept out of the main bundle until a user actually opens Charts.
const ViewChartsPanel = lazy(() => import("@/components/listViews/ViewChartsPanel"));

const daysOfWeek = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Helpers for splitting/rejoining the "yyyy-MM-ddTHH:mm" values the inline editor keeps. */
const datePart = (v: string) => (v || "").split("T")[0] || "";
const timePart = (v: string) => ((v || "").split("T")[1] || "").slice(0, 5);

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

/**
 * Most rows the calendar / filtered-view path will pull into memory.
 *
 * 10 round trips at a page each. Generous enough that no realistic date range
 * reaches it - the busiest full month is under 2,000 - and low enough that an
 * accidental whole-table fetch cannot leave the page spinning through 57 of
 * them.
 */
const APPT_MEMORY_CAP = 10000;

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

/**
 * Column widths for the list table, as shares of the table width.
 *
 * The table must be table-fixed and carry a <colgroup> built from this, because
 * the rows are windowed by a virtualizer that measures their real heights. Under
 * table-layout:auto the widths are derived from whichever rows happen to be
 * rendered, so: window renders rows A -> columns resize -> text wraps onto more
 * or fewer lines -> measured row heights change -> the virtualizer picks window
 * B -> columns resize again. That has no fixed point and flickers forever, which
 * is exactly what it did once a day had enough appointments to virtualize.
 *
 * ORDER MATTERS: a colgroup maps to columns positionally, so this list must stay
 * in the same order as the <th> cells in the table below.
 */
const COLUMN_WIDTH_KEY = "appointments.columnWidths";

const APPOINTMENT_COLUMN_WIDTHS: ColumnWidth[] = [
  // The serial number. Narrow and first, the way a day sheet is read.
  ["serial", 4],
  ["patient", 15],
  ["phone", 11],
  ["doctor", 12],
  ["payment_mode", 9],
  ["bill", 8],
  // Date and clock time in one cell: "24/09/2026" over "10:15 AM". The clinic
  // reads them together, and one column leaves the width for Investigation.
  ["start_time", 11],
  ["service", 16],
  ["status", 10],
  // Who carried out the treatment. Off by default - the day sheet already
  // runs to nine columns and the clinic has asked for its layout to stop
  // moving - so it is opted into from "Select Fields to Display", and a
  // saved view remembers the choice.
  ["therapist", 12],
];
/** The Actions column is always rendered, after every optional one. */
const ACTIONS_COLUMN_WEIGHT = 7;

const DEFAULT_APPOINTMENT_FIELDS = [
  "serial",
  "patient",
  "phone",
  "doctor",
  "payment_mode",
  "bill",
  "start_time",
  "service",
  "status",
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
  // False hides every invoice amount and payment mode on this screen.
  const canSeeBilling = useCanSeeBillingAmounts();
  const viewFields = canSeeBilling ? APPOINTMENT_VIEW_FIELDS : withoutBillingFields(APPOINTMENT_VIEW_FIELDS);
  const viewDefaultColumns = canSeeBilling ? DEFAULT_APPOINTMENT_VIEW_COLUMNS : withoutBillingFields(DEFAULT_APPOINTMENT_VIEW_COLUMNS);
  const queryClient = useQueryClient();
  const routerNavigate = useNavigate();
  // The open appointment lives in the address, so Back returns to it.
  //
  // This page alone still held the panel in the in-memory useModal context, so
  // opening one left nothing in history: going to Billing from an appointment
  // and pressing Back landed on the bare list with the appointment gone. Every
  // comparable screen - PatientDetail, Billing, Procedures - already uses this
  // hook, under the same "appointment" parameter.
  //
  // "appointmentDetail", not "appointment": Patients and Billing use that one
  // for their own side sheets, and sharing the name would pop this full-screen
  // overlay open on top of them. AppointmentDetailModal renders it.
  const { openId: selectedAppointmentId, open: openAppointment } = useUrlPanel("appointmentDetail");
  // With a panel open the page does not scroll with the window, so window-based
  // virtualization would leave blank space. Render every row directly instead.
  const inOverlay = !!selectedAppointmentId;
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
    pinDefault, unpinDefault,
    updateStandardColumns,
    viewsReady,
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
  // Defaults to every date, not this week.
  //
  // The quick date chips that used to sit above the list were removed, and
  // this default outlived them: the list still opened filtered to the current
  // week, with nothing on screen saying so now the chips were gone. "All
  // Appointments" then read 221 of 56,438 on a fresh browser and something
  // else on a browser where someone had changed the preset, for the same user
  // with the same permissions - which looked like a data or permissions fault
  // and was neither.
  //
  // A named view is free to set its own preset (see fromView.preset below),
  // and the date filter is still there in the filter panel. What is gone is
  // the invisible one.
  const [datePreset, setDatePreset] = useState<string>(pinnedInit.date || "all");
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
    // Stamped with whose they are. The key has no user in it and the front
    // desk machine is shared, so one person's pinned doctor was restored for
    // the next - and under a doctor's own-records scope a pin naming somebody
    // else intersects with what they may see and comes back empty.
    if (Object.keys(next).length) {
      localStorage.setItem(PINNED_FILTERS_KEY, JSON.stringify({ ...next, owner: viewsUserId ?? next.owner }));
    } else {
      localStorage.removeItem(PINNED_FILTERS_KEY);
    }
  };

  // Pinned filters left by somebody else are dropped once we know who is
  // signed in. Done here rather than in the state initialisers above, which
  // run before the session is known and must stay synchronous - a view that
  // waits for auth to decide its filters is the race 355ba59 fixed.
  const pinnedOwnerChecked = useRef(false);
  useEffect(() => {
    if (!viewsUserId || pinnedOwnerChecked.current) return;
    pinnedOwnerChecked.current = true;
    const owner = pinnedFilters.owner;
    if (!owner || owner === viewsUserId) return;
    persistPinned({});
    setFilterDoctors(new Set());
    setFilterStatus("all");
    setFilterVisitStatus("all");
    setDatePreset("all");
    setSpecificDate(undefined);
    setRangeFrom(undefined);
    setRangeTo(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsUserId]);

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

  // Sort state for table view. The day reads morning to evening.
  const DEFAULT_SORT = { column: "start_time", direction: "asc" } as const;
  const [sortColumn, setSortColumn] = useState<string>(DEFAULT_SORT.column);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(DEFAULT_SORT.direction);
  /**
   * Whether the order on screen is one somebody asked for.
   *
   * A header click says yes; a view carrying a real sort says yes; everything
   * else is just the default nobody chose. sortForSearch needs to know,
   * because while a search is running it replaces the default - and must not
   * replace a doctor's own choice (see appointmentSearchSort.ts).
   */
  const [sortChosen, setSortChosen] = useState(false);

  // Apply a saved view's sorting when one is selected - but only when it names
  // a column this list actually sorts on.
  //
  // list_views.sort_by defaults to 'created_at' and sort_direction to 'desc',
  // and the View editor opens pre-set to the same, so every appointment view
  // was stored that way without anyone choosing it. No list offers created_at
  // as a column, yet it was still applied: it fell through to start_time and
  // dragged the stored "desc" along, putting the last patient of the day on
  // top. And because the active view id is remembered across navigation while
  // the sort is not, leaving the module and coming back re-imposed it every
  // time - which is what staff saw when a manual sort would not stick.
  //
  // resolveViewSort keeps a sort someone really did pick and drops one they
  // did not, falling back to the default above.
  useEffect(() => {
    if (activeView && !activeView.is_standard) {
      const resolved = resolveViewSort(
        activeView.sort_field,
        activeView.sort_dir,
        viewFields,
        DEFAULT_SORT,
      );
      setSortColumn(resolved.column);
      setSortDirection(resolved.direction);
      // resolveViewSort hands back DEFAULT_SORT when the view named nothing
      // anyone picked - which is exactly "not chosen".
      setSortChosen(
        resolved.column !== DEFAULT_SORT.column || resolved.direction !== DEFAULT_SORT.direction,
      );
    } else {
      // A standard view (All Appointments, Recently Viewed) carries no sort of
      // its own, so switching to one is back to the default.
      setSortChosen(false);
    }
  }, [activeView?.id]);

  /**
   * The order to actually use, read by every consumer below.
   *
   * Computed once rather than applied at the query on purpose: if the header
   * arrow kept showing the raw state while the rows came back newest-first,
   * the first click on Date & Time would set the state to what was already on
   * screen and appear to do nothing. One value keeps the arrow, the rows and
   * the next click agreeing.
   *
   * debouncedSearchQuery, not searchQuery, so the order turns over with the
   * rows rather than a third of a second ahead of them.
   */
  const effectiveSort = useMemo(
    () => sortForSearch(
      !canSeeBilling && withoutBillingFields([sortColumn]).length === 0
        ? { column: DEFAULT_SORT.column, direction: DEFAULT_SORT.direction }
        : { column: sortColumn, direction: sortDirection },
      debouncedSearchQuery,
      sortChosen,
    ),
    [sortColumn, sortDirection, debouncedSearchQuery, sortChosen, canSeeBilling],
  );

  // Picking a view also moves the quick-date chips to whatever date that view
  // filters on, so the two date filters stop disagreeing. The chips decide what
  // is FETCHED; a view's conditions only narrow what came back, so a view with a
  // wider date than the chip was quietly losing rows the server never asked for.
  //
  // Done on the selection itself rather than in an effect on activeView.id: the
  // active view arrives asynchronously on page load, which an effect cannot tell
  // apart from the user switching views - and the date filter can be pinned (see
  // PinButton below), so a false positive there would overwrite a preference set
  // on purpose. viewDatePreset() returns null for a view with no date condition,
  // leaving the chips untouched.
  const selectViewAndDate = useCallback(
    (id: string | null) => {
      selectView(id);
      const fromView = viewDatePreset(allViews.find((v) => v.id === id)?.filters);
      if (!fromView) return;
      setDatePreset(fromView.preset);
      if (fromView.preset === "specific") setSpecificDate(fromView.specificDate);
      if (fromView.preset === "range") {
        setRangeFrom(fromView.rangeFrom);
        setRangeTo(fromView.rangeTo);
      }
    },
    [selectView, allViews],
  );

  // Remembering a view has to mean the same as picking one.
  //
  // selectViewAndDate above copies a view's own date onto the chips, but only
  // when somebody clicks. The active view is restored from the browser on every
  // load, and so are the chips - independently - so the two could disagree from
  // the first render and nothing ever reconciled them. A date pinned weeks ago
  // then bounded the fetch while the view still filtered client-side to today:
  // "Todays Appointments" read 0 items over a day with 43 appointments in it,
  // every single visit, and the filter panel it came from is closed by default.
  //
  // Once, on the restore. A chip the user picks afterwards still wins.
  const dateRestoredRef = useRef(false);
  useEffect(() => {
    if (!viewsReady || dateRestoredRef.current) return;
    dateRestoredRef.current = true;
    const fromView = viewDatePreset(activeView?.filters);
    if (!fromView) return;
    setDatePreset(fromView.preset);
    if (fromView.preset === "specific") setSpecificDate(fromView.specificDate);
    if (fromView.preset === "range") {
      setRangeFrom(fromView.rangeFrom);
      setRangeTo(fromView.rangeTo);
    }
    // Deliberately once, on the restore: activeView?.filters is read inside but
    // must not re-trigger this, or a later edit to the view would yank the
    // chips out from under whatever the user had since chosen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewsReady, activeView?.id]);

  // Inline edit state
  const [editingRow, setEditingRow] = useState<string | null>(null);

  // The front desk's changes arrive here rather than waiting for a refresh.
  // Held while a row is being edited inline or the booking dialog is open, so
  // nothing is redrawn under somebody who is typing - see useLiveAppointments.
  useLiveAppointments({ paused: editingRow !== null || open });
  const [editValues, setEditValues] = useState<any>({});
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; label: string; fromSalesforce: boolean } | null>(null);

  /**
   * What this person may DO here, as opposed to see.
   *
   * can_create, can_edit and can_delete have been stored on every role since
   * the permission table was built and were enforced nowhere, so a therapist
   * impersonated into this page was offered New Appt, a pencil, a status
   * dropdown and a delete button on all 58,001 appointments. The row that
   * says otherwise already existed; nothing read it.
   *
   * "Add Prescription" asks the procedures module instead, because that is
   * the page it navigates to - offering a button that lands on Access Denied
   * is worse than not offering it.
   */
  const { isAdmin: iAmAdmin, permissions: myPermissions } = useAuth();
  const mayAct = (action: "can_create" | "can_edit" | "can_delete") =>
    canActOnModule({ isAdmin: iAmAdmin, permissions: myPermissions, moduleKey: "appointments", action });
  const canCreateAppt = mayAct("can_create");
  const canEditAppt = mayAct("can_edit");
  const canDeleteAppt = mayAct("can_delete");
  const canAddPrescription = canViewModule({ isAdmin: iAmAdmin, permissions: myPermissions, moduleKey: "procedures" });
  const showRowActions = canEditAppt || canDeleteAppt || canAddPrescription;

  // Drag-reschedule state
  const dragRef = useRef<{ aptId: string; originalStart: string; originalEnd: string } | null>(null);

  // Drag-to-select state for creating multi-slot appointments
  const dragSelectRef = useRef<{ date: Date; startSlotIndex: number } | null>(null);
  const [dragSelectEnd, setDragSelectEnd] = useState<number | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);

  // Form state
  const [patientId, setPatientId] = useState("");
  const [staffId, setStaffId] = useState("");
  const [therapistIds, setTherapistIds] = useState<string[]>([]);
  const [serviceId, setServiceId] = useState("");
  const [appointmentStatus, setAppointmentStatus] = useState("Reserved");
  const [visitStatus, setVisitStatus] = useState("");
  // Free text for this visit. Stored in reason_for_consultation, the column the
  // Salesforce import already fills from Investigation__c.
  const [investigation, setInvestigation] = useState("");
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

  // Booking from a patient's record (Patients > Appts > Book Appointment lands
  // here with the patient already chosen) left the doctor blank, so front desk
  // picked from memory the one that patient always sees. Their last visit
  // already says who that is. Only fetched once the dialog is open with a
  // patient set, so it costs nothing until somebody books.
  const { data: recentVisits = [] } = useQuery({
    queryKey: ["new-appt-recent-visits", patientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("start_time, staff_id")
        .eq("patient_id", patientId)
        .order("start_time", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!patientId,
  });

  // Fills a blank only: a doctor chosen by hand is never overridden, resetForm
  // still clears it, and the single-doctor filter prefill is not fought over -
  // both are filling the same empty field.
  useEffect(() => {
    if (!open || staffId) return;
    const usual = usualDoctorId(
      recentVisits as PastVisit[],
      (staffList as { id: string }[]).map((s) => s.id),
    );
    if (usual) setStaffId(usual);
  }, [open, staffId, recentVisits, staffList]);

  // Saved-view filter builder options for the picklist fields
  const therapistsList = useMemo(
    () => (staffList as TherapistCandidate[]).filter((st) => isTherapistRole(st.role)),
    [staffList]
  );

  const viewDoctorOptions: PickOption[] = useMemo(
    () => doctorsList.map((d: any) => ({ value: d.id, label: `${d.first_name || ""} ${d.last_name || ""}`.trim() })),
    [doctorsList]
  );
  const viewTherapistOptions: PickOption[] = useMemo(
    () => therapistsList.map((d) => ({ value: d.id, label: `${d.first_name || ""} ${d.last_name || ""}`.trim() })),
    [therapistsList]
  );
  const viewOptionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "doctor": return viewDoctorOptions;
      case "therapist": return viewTherapistOptions;
      case "status": return statusOptions.map((s) => ({ value: s, label: s }));
      case "visit_status": return visitStatusOptions.map((s) => ({ value: s, label: s }));
      default: return [];
    }
  };

  const kanbanGroupFields = viewFields.filter((f) => f.type === "picklist");
  const kanbanSummaryFields = viewFields.filter((f) => f.type === "number");
  // A stored board grouped or summed by a money field falls back when money is hidden.
  const kanbanConfig = canSeeBilling ? kanban : {
    ...kanban,
    group_field: withoutBillingFields([kanban.group_field]).length ? kanban.group_field : "status",
    summarize_field: kanban.summarize_field && withoutBillingFields([kanban.summarize_field]).length ? kanban.summarize_field : null,
  };
  const kanbanOptions = viewOptionsFor(fieldDefIn(viewFields, kanbanConfig.group_field)?.optionsSource);
  // Kanban cards keep working off the original appointment rows (so a drag
  // still triggers the same WhatsApp-notify status-change path the inline
  // table Select uses) - this resolves the denormalized field keys
  // (doctor/bill/payment_mode/etc.) from them without remapping the rows.
  const kanbanRawValue = (row: any, key: string) => (toViewRow(row, billInvoiceByAppointmentId) as any)[key];

  const moveKanbanCard = (apt: any, field: string, value: string) => {
    const updates: any = { id: apt.id, [field]: value || null };
    if (field === "status") {
      updates.__notify = {
        phone: apt.patients?.phone || "",
        patientName: appointmentPatientName(apt, ""),
        prevStatus: apt.status,
        newStatus: value,
        startTime: apt.start_time,
        doctorName: getDoctorName(apt),
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
  const getDateFilterRange = (
    preset: string,
    // A saved view's own dates, when resolving the view's window rather than
    // the one the user picked.
    opts?: { specificDate?: Date; rangeFrom?: Date; rangeTo?: Date },
  ): { start: Date; end: Date } | null => {
    const theDate = opts?.specificDate ?? specificDate;
    const fromDate = opts?.rangeFrom ?? rangeFrom;
    const toDate = opts?.rangeTo ?? rangeTo;
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
      case "specific": return theDate ? { start: startOfDay(theDate), end: endOfDay(theDate) } : null;
      case "range":
        if (!fromDate && !toDate) return null;
        return {
          start: fromDate ? startOfDay(fromDate) : new Date(1970, 0, 1),
          end: toDate ? endOfDay(toDate) : new Date(2999, 0, 1),
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

  // The window the list actually fetches.
  //
  // `datePreset` is state the user sets, and a saved view's own date condition
  // only ever reached it through selectViewAndDate - i.e. when someone clicked
  // the view. On a page load the active view is restored from localStorage
  // asynchronously and that click never happens, so the fetch ran with no date
  // bound at all while the view's conditions still filtered client-side to,
  // say, today. Ordered by start_time ascending and capped, that fetched the
  // OLDEST rows in the table, none of which are today's: "Todays Appointments"
  // opened on "0 items" and only came right when the user picked it by hand.
  // It was also the slow one - up to the cap in rows, every load.
  //
  // Derived here rather than pushed into state, so there is no load-order race
  // to lose: an explicit preset still wins, and when there is none the view's
  // own window bounds the fetch. Narrowing to that window can never drop a row
  // the user would have seen, because the view's own conditions would have
  // filtered anything outside it away anyway.
  const viewOwnRange = (() => {
    const fromView = viewDatePreset(activeView?.filters);
    // null: the view says nothing about dates. "all": it does, but not as a
    // window we can express exactly - fetch everything and let it filter.
    if (!fromView || fromView.preset === "all") return null;
    return getDateFilterRange(fromView.preset, {
      specificDate: fromView.specificDate,
      rangeFrom: fromView.rangeFrom,
      rangeTo: fromView.rangeTo,
    });
  })();

  const appointmentsDateRange = view === "table"
    ? (getDateFilterRange(datePreset) ?? viewOwnRange)
    : calendarDateRange;

  // A saved view's filter conditions run client-side (some fields, like bill
  // amount / payment mode, only exist after joining invoices). Server-side
  // pagination would then filter just the current 200-row page, producing
  // empty pages and wrong totals - so whenever a view has filters we fall
  // back to the full date-bounded fetch and paginate in memory.
  const viewHasFilters = Boolean(activeView?.filters?.conditions?.length);

  const { data: appointments = [], isLoading: apptBulkFetching } = useQuery({
    queryKey: ["appointments", datePreset, appointmentsDateRange?.start?.toISOString(), appointmentsDateRange?.end?.toISOString()],
    queryFn: async () => {
      // Capped, because this path pulls rows into memory a page at a time.
      // With no date filter that is 56,438 rows over 57 sequential requests,
      // which is how the Photos page came to hang. It only runs for a saved
      // view whose filters are client-side and whose conditions name no date
      // (one filtering on doctor, say) - a view that does filter on a date
      // narrows this fetch through selectViewAndDate below.
      return await fetchAll<any>((from, to) => {
        let q = supabase
          .from("appointments")
          .select("*, patients(first_name, last_name, phone, gender, is_vip)")
          // Newest first. Where a view's date operator has no chip equivalent
          // (last_n_days, before, after, two date conditions, match "any"),
          // appointmentsDateRange is null and this walks the whole table to
          // the memory cap - ascending, that was the OLDEST ten thousand of
          // fifty-six thousand, which the view's own conditions then filtered
          // to nothing. A second route to the same empty list.
          .order("start_time", { ascending: false })
          .range(from, to);
        if (appointmentsDateRange) {
          q = q
            .gte("start_time", appointmentsDateRange.start.toISOString())
            .lte("start_time", appointmentsDateRange.end.toISOString());
        }
        return q;
      }, 1000, APPT_MEMORY_CAP);
    },
    // Day/Week/Month views only - the List view uses the server-paginated
    // query below instead of pulling the full date range into memory
    // (unless a saved view's client-side filters are active).
    //
    // And never before the remembered view has been restored. Until then
    // activeView is "All Appointments", which bounds nothing, so this fetched
    // the oldest rows in the table and the view's own conditions filtered them
    // to nothing - "Todays Appointments" read "0 items" every time the clinic
    // left the page and came back, and the wrong answer sat in the query cache
    // ready to be served instantly the next time.
    enabled: viewsReady && (view !== "table" || viewHasFilters),
  });

  const sortedFilterDoctors = useMemo(() => Array.from(filterDoctors).sort(), [filterDoctors]);

  const doctorNameById = useMemo(() => {
    const names = new Map<string, string>();
    for (const doctor of doctorsList as { id?: string; first_name?: string; last_name?: string }[]) {
      if (doctor?.id) names.set(doctor.id, `${doctor.first_name ?? ""} ${doctor.last_name ?? ""}`.trim());
    }
    return names;
  }, [doctorsList]);

  // What the empty row has to own up to. Named filters only - a list showing
  // everything has nothing to explain.
  const narrowedBy = useMemo(
    () =>
      activeAppointmentFilters({
        // The saved view narrows the list too, and its conditions appear on no
        // chip. Without this an empty list read "No appointments found" while
        // a view was filtering it - which is this fault one level up.
        viewName: viewHasFilters ? activeView?.name : undefined,
        datePreset,
        datePresetLabel: (key) => DATE_PRESETS.find((p) => p.key === key)?.label,
        doctorNames: Array.from(filterDoctors).map((id) => doctorNameById.get(id) || "Doctor"),
        status: filterStatus,
        visitStatus: filterVisitStatus,
        search: debouncedSearchQuery,
      }),
    [viewHasFilters, activeView?.name, datePreset, filterDoctors, doctorNameById, filterStatus, filterVisitStatus, debouncedSearchQuery],
  );

  const clearListFilters = useCallback(() => {
    setSearchQuery("");
    setFilterDoctors(new Set());
    setFilterStatus("all");
    setFilterVisitStatus("all");
    setDatePreset("all");
    setSpecificDate(undefined);
    setRangeFrom(undefined);
    setRangeTo(undefined);
    // And the saved view, which narrows the list as much as any chip. Clearing
    // only the chips left the list just as empty with nothing left to explain
    // it - an explained empty list became an unexplained one.
    selectView(null);
  }, [selectView]);

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
    effectiveSort.column,
    effectiveSort.direction,
  ];

  const { data: apptPageData, error: apptPageError, refetch: refetchApptPage, isLoading: apptPageFetching } = useQuery({
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
        sortColumn: effectiveSort.column,
        sortDirection: effectiveSort.direction,
      }),
    placeholderData: keepPreviousData,
    enabled: viewsReady && view === "table" && !viewHasFilters,
  });

  // Reset to page 1 whenever any input that reshapes the result set changes
  useEffect(() => {
    setApptPage(1);
  }, [datePreset, appointmentsDateRange?.start?.toISOString(), appointmentsDateRange?.end?.toISOString(), sortedFilterDoctors.join(","), filterStatus, filterVisitStatus, debouncedSearchQuery, effectiveSort.column, effectiveSort.direction, activeView?.id]);

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
          // No sort passed: the printout is always in clock order, whatever the
          // list is sorted by on screen. printAppointments owns that.
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

  // Invoices for the Bill Amount / Payment Mode columns.
  //
  // Both fetches below look invoices up BY APPOINTMENT ID. The calendar/
  // filtered-view one used to pull the entire invoices table instead, which
  // grew with the clinic's whole billing history rather than with the rows on
  // screen; a later page could time out, and a throwing query leaves data at
  // [], so every bill cell silently rendered as a dash. See
  // fetchInvoicesByAppointmentIds for the rest of the reasoning.
  const INVOICE_COLUMNS =
    "id, appointment_id, patient_id, created_at, total_amount, paid_amount, payment_mode, payment_splits, status";
  const fetchInvoiceChunk = async (ids: string[]) => {
    const { data, error } = await supabase
      .from("invoices")
      .select(INVOICE_COLUMNS)
      .in("appointment_id", ids);
    if (error) throw error;
    return data || [];
  };

  // The full date-bounded set: the Day/Week/Month calendars and any filtered
  // saved view read from it (via filteredAppointments/applyViewFilters/
  // toViewRow), so it is keyed on the same date range the appointments query
  // uses rather than on the id list itself.
  const fullApptIds = useMemo(() => appointments.map((a: any) => a.id), [appointments]);
  const { data: invoices = [], isError: fullInvoicesFailed, isLoading: fullInvoicesLoading } = useQuery({
    queryKey: [
      "invoices-for-appointments",
      "full",
      datePreset,
      appointmentsDateRange?.start?.toISOString(),
      appointmentsDateRange?.end?.toISOString(),
      fullApptIds.length,
    ],
    queryFn: () => fetchInvoicesByAppointmentIds(fetchInvoiceChunk, fullApptIds),
    enabled: (view !== "table" || viewHasFilters) && fullApptIds.length > 0,
  });

  const invoiceByAppointmentId = useMemo(() => invoiceMapByAppointment(invoices as any[]), [invoices]);

  // The List/table view's current server page.
  const pageApptIds = useMemo(
    () => (apptPageData?.rows ?? []).map((a: any) => a.id),
    [apptPageData]
  );
  const { data: pageInvoices = [], isError: pageInvoicesFailed, isLoading: pageInvoicesLoading } = useQuery({
    queryKey: ["invoices-for-appointments", "page", pageApptIds],
    queryFn: () => fetchInvoicesByAppointmentIds(fetchInvoiceChunk, pageApptIds),
    enabled: view === "table" && !viewHasFilters && pageApptIds.length > 0,
  });

  const pageInvoiceByAppointmentId = useMemo(
    () => invoiceMapByAppointment(pageInvoices as any[]),
    [pageInvoices]
  );

  // Whichever of the two is actually populated for this mode. Only one of the
  // fetches above ever runs: a filtered saved view works off the in-memory
  // appointment set (there is no server page to scope to), and otherwise only
  // the current page's ids are fetched. Reading the page map unconditionally
  // left every Bill Amount and Payment Mode blank under any custom view.
  const linkedInvoiceByAppointmentId = useMemo(
    () => appointmentInvoiceMap(viewHasFilters, invoiceByAppointmentId, pageInvoiceByAppointmentId),
    [viewHasFilters, invoiceByAppointmentId, pageInvoiceByAppointmentId],
  );

  /** Every visit on screen, each counted once. */
  const visitsOnScreen = useMemo(
    () => [...appointments, ...(apptPageData?.rows ?? [])] as VisitRow[],
    [appointments, apptPageData],
  );

  // Bills that never got attached to a visit. invoices.appointment_id is
  // ON DELETE SET NULL, so deleting a duplicate appointment silently detaches
  // its bill, and bills raised before the link was settled at save are already
  // unattached. Without this the visit reads "No bill" though it was paid for.
  const unlinkedBillPatientIds = useMemo(
    () => Array.from(new Set(visitsOnScreen.map((v) => v.patient_id).filter(Boolean) as string[])),
    [visitsOnScreen],
  );
  const unlinkedBillWindow = useMemo(() => {
    const times = visitsOnScreen
      .map((v) => (v.start_time ? new Date(v.start_time).getTime() : NaN))
      .filter((t) => !Number.isNaN(t));
    if (times.length === 0) return null;
    return {
      from: startOfDay(new Date(Math.min(...times))).toISOString(),
      to: endOfDay(new Date(Math.max(...times))).toISOString(),
    };
  }, [visitsOnScreen]);

  const { data: unlinkedBills = [] } = useQuery({
    queryKey: ["invoices-for-appointments", "unlinked", unlinkedBillWindow, unlinkedBillPatientIds],
    queryFn: () =>
      fetchInvoicesByAppointmentIds(async (patientIds: string[]) => {
        const { data, error } = await supabase
          .from("invoices")
          .select(INVOICE_COLUMNS)
          .in("patient_id", patientIds)
          .is("appointment_id", null)
          .gte("created_at", unlinkedBillWindow!.from)
          .lte("created_at", unlinkedBillWindow!.to);
        if (error) throw error;
        return data || [];
      }, unlinkedBillPatientIds),
    // A failure here costs nothing: the linked lookup still answers, and the
    // cell falls back to what it said before.
    enabled: !!unlinkedBillWindow && unlinkedBillPatientIds.length > 0,
  });

  const billInvoiceByAppointmentId = useMemo(
    () =>
      withUnlinkedBills(
        linkedInvoiceByAppointmentId,
        // In the same shape the linked map holds, so a cell cannot tell where
        // the bill was found: one bill, and it is its own list.
        (unlinkedBills as VisitBill[]).map((bill) => ({ ...bill, bills: [bill] })),
        visitsOnScreen,
      ),
    [linkedInvoiceByAppointmentId, unlinkedBills, visitsOnScreen],
  );

  // Patient-days that already have a bill on one of their appointments. A
  // patient can hold two records for the same slot - Kiran Shetty had two at
  // 4:00 PM on 21 September against a single Rs 6,300 bill - and the row
  // without it read "No bill" while he had in fact paid. Built from rows
  // already fetched, so it costs no query.
  const billedOnAnotherVisit = useMemo(() => {
    const rows: BilledDayRow[] = [...appointments, ...(apptPageData?.rows ?? [])];
    return billedPatientDays(rows, (id) => billInvoiceByAppointmentId.has(id));
  }, [appointments, apptPageData, billInvoiceByAppointmentId]);

  // Say so instead of showing a column of dashes that looks like "no bills".
  const billLookupFailed = fullInvoicesFailed || pageInvoicesFailed;
  // Only one of the two queries ever runs; a disabled one reports isLoading
  // false, so OR-ing them is safe and mirrors billLookupFailed above.
  const billLookupLoading = fullInvoicesLoading || pageInvoicesLoading;

  // One dash used to stand for "no bill", "lookup failed", "still loading" and
  // "nothing to show" alike, and the clinic read it as money going missing on a
  // day whose takings actually reconciled with Salesforce to the paise. Say
  // which it is - and never claim "No bill" when the figure is simply unknown.
  const renderBillCell = (
    invoice: VisitBilling | undefined,
    apt?: { patient_id?: string | null; start_time?: string | null },
    emphasise = false,
  ) => {
    const key = apt ? patientDayKey(apt.patient_id, apt.start_time) : null;
    switch (billCellState({
      hasInvoice: !!invoice,
      loading: billLookupLoading,
      failed: billLookupFailed,
      billedElsewhere: !!key && billedOnAnotherVisit.has(key),
    })) {
      case "amount": {
        // A visit can carry more than one bill - the consultation charged apart
        // from the treatment, on 883 of them - and the clinic asked to see each.
        // One bill, which is almost every visit, renders exactly as before.
        const bills = invoice.bills ?? [];
        if (bills.length > 1) {
          return (
            <span className={cn("flex flex-col leading-tight", emphasise && "font-medium")}>
              {bills.map((bill, i) => (
                <span key={bill.id ?? i}>{formatMoneyExact(bill.total_amount)}</span>
              ))}
            </span>
          );
        }
        return <span className={emphasise ? "font-medium" : undefined}>{formatMoneyExact(invoice.total_amount)}</span>;
      }
      case "failed":
        return <span className="text-destructive" title="The bill could not be loaded - this is not the same as there being none">Unavailable</span>;
      case "loading":
        return <span className="text-muted-foreground">…</span>;
      case "elsewhere":
        return (
          <span
            className="text-muted-foreground italic"
            title="This patient has another appointment on the same day, and the bill is on that one"
          >
            On another visit
          </span>
        );
      default:
        return <span className="text-muted-foreground">No bill</span>;
    }
  };
  useEffect(() => {
    if (billLookupFailed) toast.error("Could not load bill amounts - the Bill and Payment Mode columns may be blank.");
  }, [billLookupFailed]);

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
      patient: appointmentPatientName(apt, ""),
      phone: apt.patients?.phone || "",
      service: apt.service || "",
      doctor: apt.staff_id || "",
      therapist: apt.therapist_id || "",
      // The whole list, for filtering only. The column above still shows the
      // first person, so nothing that reads `therapist` changes.
      therapist_ids: therapistIdsOf(apt),
      status: apt.status || "",
      visit_status: apt.visit_status || "",
      bill: canSeeBilling ? inv?.total_amount || 0 : 0,
      payment_mode: canSeeBilling ? inv?.payment_mode || "" : "",
    };
  };

  // Apply the active saved view's filters (if any). Keeps the same call
  // signature/sites as before so both calendar and table rows are filtered
  // exactly as they were pre-migration - only the underlying engine and its
  // (richer, multi-condition) filter UI changed.
  const applyViewFilters = (items: any[], invMap: Map<string, any> = invoiceByAppointmentId) => {
    if (!activeView?.filters?.conditions?.length) return items;
    const denormalized = items.map((apt) => toViewRow(apt, invMap));
    const kept = new Set(applyListFilters(denormalized, canSeeBilling ? activeView.filters : withoutBillingConditions(activeView.filters), viewFields).map((r) => r.id));
    return items.filter((apt) => kept.has(apt.id));
  };

  // Filtered appointments
  let filteredAppointments = appointments.filter((apt: any) => {
    if (filterDoctors.size > 0 && apt.staff_id && !filterDoctors.has(apt.staff_id)) return false;
    if (filterStatus !== "all" && apt.status !== filterStatus) return false;
    if (filterVisitStatus !== "all" && (apt.visit_status || "") !== filterVisitStatus) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const name = appointmentPatientHaystack(apt);
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
  // Which fetch backs that count depends on the view, same as the rows.
  // Waiting for the remembered view counts as loading. A disabled query reports
  // isLoading false, so without this the table said "No appointments found"
  // while it was still working out which appointments to ask for.
  const apptPageLoading = !viewsReady || (viewHasFilters ? apptBulkFetching : apptPageFetching);
  // "Is there a next page" comes from the probe row the fetcher reports, which
  // arrived in the same snapshot as the rows, never from apptTotal.
  const apptHasMore = viewHasFilters
    ? apptPage * APPT_PAGE_SIZE < filteredAppointments.length
    : (apptPageData?.hasMore ?? false);
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
  // A saved view stores its own column list in the database, and one saved
  // before "Next Visit" was removed still names visit_status. Left in, it
  // would render a header with no matching <col> and slide every column out
  // of true, so it is filtered on the way in rather than migrated in place.
  const displayColumns = (activeView?.columns?.length ? activeView.columns : DEFAULT_APPOINTMENT_FIELDS)
    .filter((c) => APPOINTMENT_COLUMN_WIDTHS.some(([key]) => key === c))
    .filter((c) => canSeeBilling || withoutBillingFields([c]).length > 0);

  // Widths the user dragged, kept per browser. They are a display preference
  // rather than part of the shared view, so they are not written to the
  // database - which does mean another machine starts from the defaults.
  const [columnWidths, setColumnWidths] = useState<ColumnWidth[]>(() => {
    try {
      return mergeSavedWidths(APPOINTMENT_COLUMN_WIDTHS, JSON.parse(localStorage.getItem(COLUMN_WIDTH_KEY) || "null"));
    } catch {
      return APPOINTMENT_COLUMN_WIDTHS;
    }
  });

  const applyColumnResize = (key: string, deltaShares: number) => {
    setColumnWidths((prev) => {
      const next = resizeColumn(prev, key, deltaShares);
      try {
        localStorage.setItem(COLUMN_WIDTH_KEY, JSON.stringify(Object.fromEntries(next)));
      } catch {
        // A browser with storage blocked still resizes for this session.
      }
      return next;
    });
  };

  // Check if a column should be displayed
  /**
   * The serial number is furniture, like Actions: it numbers whatever rows are
   * on screen rather than showing a field, so it is not in anyone's saved
   * column list and must not depend on being there. Without this, every user
   * who has ever opened "Select Fields to Display" would lose it, and the
   * colgroup would run one <col> short of the headers.
   */
  const ALWAYS_SHOWN_COLUMNS = ["serial"];
  const shouldShowColumn = (column: string) =>
    ALWAYS_SHOWN_COLUMNS.includes(column) || displayColumns.includes(column);

  // Width shares for the columns actually on screen, renormalised so they fill
  // the table whichever subset is shown.
  const visibleColumnWidths = columnWidths.filter(([key]) => shouldShowColumn(key));
  const totalColumnWeight =
    visibleColumnWidths.reduce((sum, [, w]) => sum + w, 0) + ACTIONS_COLUMN_WEIGHT;
  const colWidth = (weight: number) => `${((weight / totalColumnWeight) * 100).toFixed(4)}%`;

  const toggleSort = (column: string) => {
    // Read off effectiveSort, not the raw state: while a search is running the
    // rows are newest-first whatever sortDirection happens to hold, and a
    // click has to flip what the doctor can actually see.
    setSortChosen(true);
    if (effectiveSort.column === column) {
      setSortColumn(column);
      setSortDirection(effectiveSort.direction === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (effectiveSort.column !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return effectiveSort.direction === "asc" ? <ArrowUp className="h-3 w-3 ml-1 text-primary" /> : <ArrowDown className="h-3 w-3 ml-1 text-primary" />;
  };

  const startInlineEdit = (apt: any) => {
    setEditingRow(apt.id);
    setEditValues({
      // The column is Investigation, so that is what the row edits. `service`
      // is still carried so saving a row cannot blank it - it drives billing.
      reason_for_consultation: apt.reason_for_consultation || "",
      service: apt.service || "",
      staff_id: apt.staff_id || "",
      therapist_ids: therapistIdsOf(apt),
      status: apt.status,
      start_time: format(new Date(apt.start_time), "yyyy-MM-dd'T'HH:mm"),
      end_time: format(new Date(apt.end_time), "yyyy-MM-dd'T'HH:mm"),
    });
  };

  const saveInlineEdit = async () => {
    if (!editingRow) return;
    // joinDateTime returns "" when either half is blank, and the guards below
    // skip a falsy value - so clearing the time and changing only the date used
    // to write nothing at all and still report "Updated". Say so instead.
    if (hasIncompleteDateTime(editValues)) {
      toast.error("Set both a date and a time before saving");
      return;
    }
    const updates: any = {};
    if (editValues.reason_for_consultation !== undefined)
      updates.reason_for_consultation = editValues.reason_for_consultation.trim() || null;
    if (editValues.service) updates.service = editValues.service;
    if (editValues.staff_id) updates.staff_id = editValues.staff_id;
    // Not a truthy guard, unlike the doctor above: clearing the therapist has
    // to be possible, so an empty choice must reach the database as null. Both
    // columns move together - therapist_id carries the first of them, which is
    // all the published build can read.
    if (editValues.therapist_ids !== undefined) {
      updates.therapist_ids = editValues.therapist_ids;
      updates.therapist_id = editValues.therapist_ids[0] || null;
    }
    if (editValues.status) updates.status = editValues.status;
    if (editValues.start_time) updates.start_time = new Date(editValues.start_time).toISOString();
    if (editValues.end_time) updates.end_time = new Date(editValues.end_time).toISOString();
    const row = editingRow;
    const apply = () => inlineUpdateMutation.mutate({ id: row, ...updates });
    if (updates.start_time) void guardVisitMove(row, updates.start_time, apply);
    else apply();
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
        // A time left half typed gives NaN here, and setHours(NaN) makes a
        // date that only fails later - inside toISOString(), as "Invalid time
        // value". Say what is actually wrong instead.
        if (Number.isNaN(h) || Number.isNaN(m)) {
          throw new Error("Enter a start and end time before saving.");
        }
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

      // Read by id, not looked up in the page's cached list. The front desk
      // creates a patient and books them within the minute, so that list
      // almost never has them yet - and a miss there meant the confirmation
      // silently did not go out, under "No phone number on this patient's
      // record" on a screen showing the number. See bookingPatient.ts.
      const patient = await patientForBooking(patientId, patients.find((p) => p.id === patientId));
      const patientName = patient?.name ?? null;
      // Appointments created from the clinic app are always tagged "Walk-in".
      // Portal-originated bookings tag themselves as "portal" at creation time.
      const patientSource = "Walk-in";
      const selectedService = services.find((s) => s.id === serviceId);
      const serviceName = selectedService?.name || "";
      const wasRecurring = isRecurring && !!recurrenceEndDate;
      let newAppointmentId: string | null = null;

      if (wasRecurring) {
        const dates = generateRecurringDates(startDate, recurrencePattern, recurrenceEndDate!);
        const rows = dates.map((d) => ({
          patient_id: patientId || null,
          patient_name: patientName,
          staff_id: staffId || null,
          therapist_id: therapistIds[0] || null,
          therapist_ids: therapistIds,
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
          reason_for_consultation: investigation.trim() || null,
        }));
        const { error } = await supabase.from("appointments").insert(rows as any);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from("appointments").insert({
          patient_id: patientId || null,
          patient_name: patientName,
          staff_id: staffId || null,
          therapist_id: therapistIds[0] || null,
          therapist_ids: therapistIds,
          service: serviceName,
          status: appointmentStatus,
          visit_status: visitStatus || null,
          start_time: startDT.toISOString(),
          end_time: buildDateTime(startDate, endTime).toISOString(),
          is_recurring: false,
          source: patientSource,
          problem_area_ids: selectedProblemAreas,
          appointment_type: appointmentType,
          reason_for_consultation: investigation.trim() || null,
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
        // Now actually populated: the cached list never selected gender.
        patientGender: patient?.gender || null,
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
      //
      // A skipped send now says why. It used to say nothing at all, which is how
      // the clinic came to report "confirmations do not reach patients" with
      // nothing on screen to show which bookings had been missed.
      const sendPlan = confirmationSendPlan({
        status: data.capturedStatus,
        phone: data.phone,
        patientName: data.patientName,
      });
      if (sendPlan.skippedBecause) toast.warning(sendPlan.skippedBecause);
      if (sendPlan.send && data.firstStartDT) {
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
            .then(async ({ error }) => {
              if (error) {
                console.error("Recurring WhatsApp send failed:", error);
                toast.error(await edgeFunctionErrorMessage(error, "The WhatsApp confirmation could not be sent."));
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
            .then(async ({ error }) => {
              if (error) {
                // Said out loud, not only to the console. A confirmation that
                // silently fails is one the patient never hears about and the
                // front desk never knows to re-send.
                console.error("WhatsApp send failed:", error);
                toast.error(await edgeFunctionErrorMessage(error, "The WhatsApp confirmation could not be sent."));
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
      const surveyToFillNow = Boolean(
        data.fillNowSurveyTemplateId &&
        data.capturedPatientId &&
        data.newAppointmentId &&
        !data.wasRecurring
      );
      if (surveyToFillNow) {
        setPendingFillNow({
          templateId: data.fillNowSurveyTemplateId,
          appointmentId: data.newAppointmentId,
          patientId: data.capturedPatientId,
        });
      }
      resetForm();
      setOpen(false);
      // Show front desk what they just booked, so the time, the doctor and the
      // service can be checked without hunting for the row. Not when something
      // else is already opening over the page - see openNewAppointment.ts.
      if (shouldOpenNewAppointment({
        appointmentId: data.newAppointmentId,
        wasRecurring: data.wasRecurring,
        surveyToFillNow,
      })) {
        openAppointment(data.newAppointmentId as string);
      }
      if (data.wasRecurring) {
        setLastCreatedPatientId(data.capturedPatientId);
        setLastCreatedService(data.capturedServiceName);
        // "Create Billing Plan?" leads into Billing, which a role that may not see
        // billing amounts cannot open - so it is not offered to them.
        if (canSeeBilling) setShowBillingPrompt(true);
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: async (data: Record<string, any>) => {
      const { id, __notify, ...updates } = data;
      // Ask for the row back. An UPDATE that RLS filters out is not an error -
      // it reports zero rows and no error - so without this the toast said
      // "Updated" and the WhatsApp below went to the patient for a change that
      // never saved.
      const { data: written, error } = await supabase
        .from("appointments").update(updates as any).eq("id", id).select("id");
      if (error) throw error;
      assertWrote(written);
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
            } else if (newStatus === "Confirmed" && APPOINTMENT_CONFIRMATION_WHATSAPP_ENABLED) {
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

  /**
   * Moving a visit that already happened is not a reschedule.
   *
   * Tahniya's 25 September visit was overwritten by her next booking and her
   * ₹3,000 bill went with it. Every path that changes an appointment's date
   * goes through this first; it only interrupts when the appointment is in the
   * past and something happened at it. See appointmentReschedule.ts.
   */
  const [visitMovePrompt, setVisitMovePrompt] = useState<{
    apt: BookableAppointment;
    newStart: string;
    evidence: VisitEvidence;
    proceed: () => void;
  } | null>(null);

  const appointmentById = (id: string): BookableAppointment | undefined =>
    (visitsOnScreen as BookableAppointment[]).find((a) => a.id === id);

  const guardVisitMove = async (id: string, newStart: string, proceed: () => void) => {
    const apt = appointmentById(id);
    if (!apt?.start_time) {
      proceed();
      return;
    }
    // Asked for every move, not only for one already in the past. The clinic
    // sees people early: Alister Moras was prescribed for at 11:07 and his
    // appointment moved to November at 11:09, an hour before the 12:15 it was
    // booked for - "still in the future" was exactly why nothing asked.
    const hasInvoice = billInvoiceByAppointmentId.has(id);
    let hasProcedure = false;
    if (!hasInvoice) {
      // One row, and only when a bill has not already settled the question.
      const { data } = await supabase.from("procedures").select("id").eq("appointment_id", id).limit(1);
      hasProcedure = (data?.length ?? 0) > 0;
    }
    const evidence = { hasInvoice, hasProcedure };
    if (rescheduleVerdict(apt, newStart, evidence) !== "confirm") {
      proceed();
      return;
    }
    setVisitMovePrompt({ apt, newStart, evidence, proceed });
  };

  /** Keep the visit, put the new date on a new appointment. */
  const bookInsteadMutation = useMutation({
    mutationFn: async () => {
      const prompt = visitMovePrompt;
      if (!prompt) return;
      const start = new Date(prompt.newStart);
      const original = new Date(prompt.apt.start_time);
      const originalEnd = prompt.apt.end_time ? new Date(prompt.apt.end_time) : null;
      const durationMs = originalEnd ? originalEnd.getTime() - original.getTime() : 15 * 60 * 1000;
      const { error } = await supabase.from("appointments").insert({
        patient_id: prompt.apt.patient_id,
        patient_name: prompt.apt.patient_name ?? null,
        staff_id: prompt.apt.staff_id ?? null,
        service: prompt.apt.service ?? null,
        start_time: start.toISOString(),
        end_time: new Date(start.getTime() + durationMs).toISOString(),
        status: "Reserved",
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
      setVisitMovePrompt(null);
      toast.success("New appointment booked - the earlier visit is unchanged");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rescheduleAppointment = useMutation({
    mutationFn: async ({ id, newStart, newEnd }: { id: string; newStart: string; newEnd: string }) => {
      const { data: written, error } = await supabase
        .from("appointments").update({ start_time: newStart, end_time: newEnd }).eq("id", id).select("id");
      if (error) throw error;
      assertWrote(written);
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
    setTherapistIds([]);
    setServiceId("");
    setAppointmentStatus("Reserved");
    setVisitStatus("");
    setInvestigation("");
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
    // Oldest first. The rows arrive newest-first - that order is deliberate in
    // the bulk query above, where ascending filled the memory cap with the
    // oldest ten thousand appointments and the view's own conditions then
    // filtered them to nothing. But a Month cell renders only its first three
    // and buries the rest under "+N more", so newest-first there put the
    // evening bookings in sight and the morning ones out of it. Sort here,
    // where the day is read, and leave the fetch alone.
    return filteredAppointments
      .filter((a: any) => isSameDay(new Date(a.start_time), date))
      .sort((a: any, b: any) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
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

  // Who saw the patient. Falls back to the recorded name because nine doctors
  // who worked here between 2020 and 2026 were never staff members and are not
  // going to be - without the fallback their 3,640 appointments show no doctor
  // at all.
  const getDoctorName = (apt: any) => {
    const fromStaff = apt.staff_id ? staffMap.get(apt.staff_id) : "";
    return fromStaff || apt.doctor_name || "";
  };

  /**
   * The rows in the order the headers ask for.
   *
   * Most columns are ordered by Postgres before the page is cut, so this
   * usually hands `visibleTableRows` straight back. Two cases need doing here:
   * Bill Amount and Payment Mode, whose values are looked up per page and so
   * have nothing on `appointments` to order by; and a saved view carrying
   * filter conditions, which abandons server paging for a bulk query with a
   * fixed order - every header on such a view was inert until now.
   */
  const sortedTableRows = useMemo(() => {
    const needsClientSort = viewHasFilters || isPageSortedColumn(effectiveSort.column);
    if (!needsClientSort) return visibleTableRows;
    type SortRow = {
      id: string;
      start_time?: string | null;
      status?: string | null;
      patient_name?: string | null;
      patients?: { first_name?: string | null; last_name?: string | null; phone?: string | null } | null;
      reason_for_consultation?: string | null;
      service?: string | null;
      staff_id?: string | null;
      doctor_name?: string | null;
    };
    return sortAppointments(visibleTableRows as SortRow[], effectiveSort.column, effectiveSort.direction, {
      invoiceFor: (id: string) => billInvoiceByAppointmentId.get(id),
      patientName: (apt: SortRow) =>
        appointmentPatientName(apt, ""),
      phone: (apt: SortRow) => apt.patients?.phone || "",
      doctorName: (apt: SortRow) => getDoctorName(apt),
      investigation: (apt: SortRow) => investigationText(apt, ""),
    });
    // getDoctorName reads staffMap, which is the dependency that matters.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleTableRows, viewHasFilters, effectiveSort.column, effectiveSort.direction, billInvoiceByAppointmentId, staffMap]);

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
    void guardVisitMove(aptId, newStart.toISOString(), () =>
      rescheduleAppointment.mutate({ id: aptId, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() }),
    );
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
    void guardVisitMove(aptId, newStart.toISOString(), () =>
      rescheduleAppointment.mutate({ id: aptId, newStart: newStart.toISOString(), newEnd: newEnd.toISOString() }),
    );
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
      onClick={(e) => { e.stopPropagation(); openAppointment(apt.id); }}
    >
      <p className="font-medium truncate flex items-center gap-1">
        {appointmentPatientIsVip(apt) && <VipBadge size="icon" />}
        <span className="truncate">{appointmentPatientName(apt)}</span>
      </p>
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
            {narrowedBy.length > 0 && (
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
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setLockPatient(false); }}>
            {canCreateAppt && (
            <DialogTrigger asChild>
              <Button className="gap-2 h-8 md:h-9 text-xs md:text-sm"><Plus className="h-4 w-4" /> <span className="hidden sm:inline">New</span> Appt</Button>
            </DialogTrigger>
            )}
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

                  {/* Who will carry out the treatment, as opposed to who sees
                      the patient. Optional at booking - the front desk often
                      does not know yet, and it is set or swapped later from
                      the appointment itself. */}
                  <div>
                    <Label>{THERAPIST_FIELD_LABEL}</Label>
                    <StaffMultiCombobox
                      className="mt-1.5"
                      value={therapistIds}
                      onValueChange={setTherapistIds}
                      roleFilter={[...THERAPIST_ROLES]}
                      placeholder="Select therapist or nurse"
                    />
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

                {/* Investigation. Reason for Consultation now lives on the patient. */}
                <div>
                  <Label>Investigation</Label>
                  <Textarea
                    value={investigation}
                    onChange={(e) => setInvestigation(e.target.value)}
                    placeholder="What was investigated at this visit"
                    rows={2}
                    className="mt-1.5"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Date *</Label>
                    <CalendarPopover
                      selected={startDate}
                      onSelect={setStartDate}
                      disabled={disablePastDates}
                      trigger={
                        <Button variant="outline" className={cn("w-full mt-1.5 justify-start text-left font-normal", !startDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">{startDate ? format(startDate, "PP") : "Pick a date"}</span>
                        </Button>
                      }
                    />
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
                        <CalendarPopover
                          selected={recurrenceEndDate}
                          onSelect={setRecurrenceEndDate}
                          disabled={(date) => date < (startDate || new Date())}
                          trigger={
                            <Button variant="outline" className={cn("w-full mt-1.5 justify-start text-left font-normal", !recurrenceEndDate && "text-muted-foreground")}>
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {recurrenceEndDate ? format(recurrenceEndDate, "PPP") : "Select end date"}
                            </Button>
                          }
                        />
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

      {view === "table" && apptPageError && (
        <QueryTimeoutNotice error={apptPageError} onRetry={() => refetchApptPage()} className="mb-4" />
      )}

      {view === "table" && (

        <div className="mb-4">
          <ViewBar
            views={allViews}
            activeView={activeView}
            currentUserId={viewsUserId}
            onSelect={selectViewAndDate}
            onNew={() => { setEditingView(null); setViewEditorOpen(true); }}
            onEdit={(v) => { setEditingView(v); setViewEditorOpen(true); }}
            onDelete={(v) => setDeleteViewTarget(v)}
            onPin={pinDefault}
            onUnpin={unpinDefault}
            onClone={(v) => { setEditingView({ ...v, id: undefined as any, name: `${v.name} (Copy)`, is_default: false }); setViewEditorOpen(true); }}
            onFields={() => setViewFieldsOpen(true)}
            onRefresh={() => queryClient.invalidateQueries({ queryKey: ["appointments"] })}
            display={tableDisplay}
            onDisplayChange={setTableDisplay}
            displayModes={["table", "kanban"]}
            onKanbanSettings={() => setKanbanOpen(true)}
            count={apptTotal}
            countLoading={apptPageLoading}
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
                fields={viewFields}
                optionsFor={viewOptionsFor}
                onSave={(filters) => { if (activeView) saveView({ ...activeView, filters }); }}
                onClose={() => setViewFiltersOpen(false)}
                itemLabel="appointments"
              />
            ) : activeView && !activeView.is_standard ? (
              <Suspense fallback={<div className="p-4 text-sm text-muted-foreground">Loading charts…</div>}>
                <ViewChartsPanel
                  charts={activeView.charts ?? []}
                  rows={visibleTableRows.map((apt) => toViewRow(apt, billInvoiceByAppointmentId))}
                  canManage={activeView.owner_id === viewsUserId}
                  onChange={(charts) => saveCharts(activeView.id, charts)}
                  onClose={() => setViewChartsOpen(false)}
                  fields={viewFields}
                  // A chart grouped by a picklist shows the names behind the
                  // ids the column stores - the doctor field holds a staff id.
                  optionsFor={viewOptionsFor}
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
              <CalendarPopover
                selected={specificDate}
                onSelect={setSpecificDate}
                trigger={
                  <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-2", specificDate && "border-primary text-primary")}>
                    <CalendarIcon className="h-4 w-4" />
                    {specificDate ? format(specificDate, "MMM d, yyyy") : "Pick a date"}
                  </Button>
                }
              />
            )}

            {datePreset === "range" && (
              <>
                <CalendarPopover
                  selected={rangeFrom}
                  onSelect={setRangeFrom}
                  trigger={
                    <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-2", rangeFrom && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                      {rangeFrom ? format(rangeFrom, "MMM d, yyyy") : "From"}
                    </Button>
                  }
                />
                <CalendarPopover
                  selected={rangeTo}
                  onSelect={setRangeTo}
                  trigger={
                    <Button variant="outline" size="sm" className={cn("h-9 text-sm gap-2", rangeTo && "border-primary text-primary")}>
                      <CalendarIcon className="h-4 w-4" />
                      {rangeTo ? format(rangeTo, "MMM d, yyyy") : "To"}
                    </Button>
                  }
                />
              </>
            )}

            {narrowedBy.length > 0 && (
              <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => { setSearchQuery(""); setFilterDoctors(new Set()); setFilterStatus("all"); setFilterVisitStatus("all"); setDatePreset("all"); setSpecificDate(undefined); setRangeFrom(undefined); setRangeTo(undefined); }}>Clear filters</Button>
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
                <CalendarPopover
                   selected={currentDate}
                  onSelect={(date) => { if (date) setCurrentDate(date); }}
                  modifiers={{ hasAppointment: appointmentDates }}
                  modifiersClassNames={{ hasAppointment: "bg-primary/20 font-bold" }}
                  trigger={
                    <Button variant="ghost" className="font-display font-semibold text-base hover:bg-muted/50 gap-1.5 px-2">
                      {view === "month"
                        ? format(currentDate, "MMMM yyyy")
                        : currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  }
                />
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
                {tableDisplay === "kanban" ? (
                  <ListKanban
                    rows={visibleTableRows}
                    config={kanbanConfig}
                    options={kanbanOptions}
                    columns={displayColumns}
                    fields={viewFields}
                    rawValue={kanbanRawValue}
                    onOpen={(row) => openAppointment(row.id)}
                    onMove={moveKanbanCard}
                    titleField="patient"
                  />
                ) : (
                <>
                <table ref={appointmentsTableRef} className="w-full text-sm responsive-table table-fixed">
                  <colgroup>
                    {visibleColumnWidths.map(([key, weight]) => (
                      <col key={key} style={{ width: colWidth(weight) }} />
                    ))}
                    <col style={{ width: colWidth(ACTIONS_COLUMN_WEIGHT) }} />
                  </colgroup>
                  <thead>
                    <tr className="border-b bg-muted/30">
                      {/* The serial number is the row's position in the list, so
                          it is the one header that cannot be sorted by. */}
                      {shouldShowColumn("serial") && (
                        <th className="relative text-right p-3 font-medium text-muted-foreground">#
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("serial", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("patient") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("patient")}>
                          <span className="flex items-center">Patient<SortIcon column="patient" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("patient", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("phone") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("phone")}>
                          <span className="flex items-center">Phone<SortIcon column="phone" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("phone", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("doctor") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("doctor")}>
                          <span className="flex items-center">Doctor<SortIcon column="doctor" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("doctor", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("therapist") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("therapist")}>
                          <span className="flex items-center">Therapist<SortIcon column="therapist" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("therapist", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("payment_mode") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" title="Sorts the appointments on this page - the bill is looked up per page, so it cannot be ordered across them" onClick={() => toggleSort("payment_mode")}>
                          <span className="flex items-center">Payment Mode<SortIcon column="payment_mode" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("payment_mode", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("bill") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" title="Sorts the appointments on this page - the bill is looked up per page, so it cannot be ordered across them" onClick={() => toggleSort("bill")}>
                          <span className="flex items-center">Bill Amount<SortIcon column="bill" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("bill", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("start_time") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("start_time")}>
                          <span className="flex items-center">Date &amp; Time<SortIcon column="start_time" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("start_time", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {/* Column key stays "service" so saved views keep working; what it
                          shows and sorts on is the Investigation text. */}
                      {shouldShowColumn("service") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("reason_for_consultation")}>
                          <span className="flex items-center">Investigation<SortIcon column="reason_for_consultation" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("service", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {shouldShowColumn("status") && (
                        <th className="relative text-left p-3 font-medium text-muted-foreground cursor-pointer hover:text-foreground select-none" onClick={() => toggleSort("status")}>
                          <span className="flex items-center">Status<SortIcon column="status" /></span>
                          <ColumnResizeHandle
                            onResize={(delta) => applyColumnResize("status", delta)}
                            tableWidth={() => appointmentsTableRef.current?.clientWidth ?? 0}
                          />
                        </th>
                      )}
                      {showRowActions && <th className="text-left p-3 font-medium text-muted-foreground w-20">Actions</th>}
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
                      // The columns actually rendered: the saved ones that survive
                      // the width filter, plus the always-shown ones, plus Actions.
                      const colSpan = visibleColumnWidths.length + 1;

                      return (
                        <>
                          {paddingTop > 0 && (
                            <tr><td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} /></tr>
                          )}
                          {virtualRows.map((virtualRow) => {
                            const apt = sortedTableRows[virtualRow.index];
                            if (!apt) return null;
                            const patientPhone = apt.patients?.phone || "";
                            const invoice = billInvoiceByAppointmentId.get(apt.id);
                            const isEditing = editingRow === apt.id;

                            if (isEditing) {
                              return (
                                <tr
                                  key={apt.id}
                                  ref={rowVirtualizer.measureElement}
                                  data-index={virtualRow.index}
                                  className="border-b bg-primary/5"
                                >
                                  {/* The editor gets a row of its own, spanning the table.
                                      Laid out cell-by-cell it had to live inside columns sized
                                      for reading - Date is 7% of the width, enough for "Sep 24",
                                      and Time 12%, enough for "10:15 AM - 10:30 AM" - so a date
                                      box and two time pickers were crushed into them and came
                                      out as "24/09/20:" and ": AM PM". Those shares cannot
                                      simply be widened: the colgroup is table-wide and the
                                      virtualizer measures against it (see
                                      APPOINTMENT_COLUMN_WIDTHS). A colSpan cell sidesteps the
                                      colgroup entirely, so the editor gets the full width and
                                      the reading columns are left alone. */}
                                  <td className="p-3" colSpan={visibleColumnWidths.length + 1}>
                                    <div className="flex flex-wrap items-end gap-3">
                                      {/* Always shown, whatever columns are on: without it the
                                          strip does not say whose appointment is being changed. */}
                                      <div className="min-w-[9rem]">
                                        <span className="text-[11px] text-muted-foreground">Patient</span>
                                        <p className="text-sm font-medium leading-tight flex items-center gap-1.5">
                                          <span>{appointmentPatientName(apt)}</span>
                                          {appointmentPatientIsVip(apt) && <VipBadge />}
                                        </p>
                                        <p className="text-xs text-muted-foreground leading-tight">{patientPhone || "—"}</p>
                                      </div>

                                      {shouldShowColumn("service") && (
                                        <div className="min-w-[13rem] flex-1">
                                          <span className="text-[11px] text-muted-foreground">Investigation</span>
                                          <Input
                                            className="mt-1 h-8 text-xs"
                                            placeholder="Investigation"
                                            value={editValues.reason_for_consultation ?? ""}
                                            onChange={(e) => setEditValues({ ...editValues, reason_for_consultation: e.target.value })}
                                          />
                                        </div>
                                      )}

                                      {shouldShowColumn("doctor") && (
                                        <div className="w-44">
                                          <span className="text-[11px] text-muted-foreground">Doctor</span>
                                          <Select value={editValues.staff_id} onValueChange={(val) => setEditValues({ ...editValues, staff_id: val })}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                                            <SelectContent>
                                              {doctorsList.map((d: any) => <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>)}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}

                                      {shouldShowColumn("therapist") && (
                                        <div className="w-44">
                                          <span className="text-[11px] text-muted-foreground">{THERAPIST_FIELD_LABEL}</span>
                                          <StaffMultiCombobox
                                            className="mt-1"
                                            value={editValues.therapist_ids || []}
                                            onValueChange={(val) => setEditValues({ ...editValues, therapist_ids: val })}
                                            roleFilter={[...THERAPIST_ROLES]}
                                            placeholder="Select"
                                          />
                                        </div>
                                      )}

                                      {shouldShowColumn("start_time") && (
                                        <div className="w-36">
                                          <span className="text-[11px] text-muted-foreground">Date</span>
                                          <DateInput
                                            className="mt-1 h-8 text-xs"
                                            value={datePart(editValues.start_time)}
                                            onChange={(isoDate) =>
                                              setEditValues((v: any) => ({
                                                ...v,
                                                start_time: joinDateTime(isoDate, timePart(v.start_time)),
                                                end_time: joinDateTime(isoDate, timePart(v.end_time)),
                                              }))
                                            }
                                          />
                                        </div>
                                      )}

                                      {/* Gated on start_time, not on a "time" column: date
                                          and clock time are one column now, and the editor
                                          still has to offer both ends of the slot even
                                          though only the start is displayed. */}
                                      {shouldShowColumn("start_time") && (
                                        <>
                                          <div className="w-36">
                                            <span className="text-[11px] text-muted-foreground">Start</span>
                                            <TimePicker12h
                                              compact
                                              className="mt-1"
                                              value={timePart(editValues.start_time)}
                                              onChange={(t) =>
                                                setEditValues((v: any) => ({ ...v, start_time: joinDateTime(datePart(v.start_time), t) }))
                                              }
                                            />
                                          </div>
                                          <div className="w-36">
                                            <span className="text-[11px] text-muted-foreground">End</span>
                                            <TimePicker12h
                                              compact
                                              className="mt-1"
                                              value={timePart(editValues.end_time)}
                                              onChange={(t) =>
                                                setEditValues((v: any) => ({ ...v, end_time: joinDateTime(datePart(v.end_time) || datePart(editValues.start_time), t) }))
                                              }
                                            />
                                          </div>
                                        </>
                                      )}

                                      {shouldShowColumn("status") && (
                                        <div className="w-36">
                                          <span className="text-[11px] text-muted-foreground">Status</span>
                                          <Select value={editValues.status} onValueChange={(val) => setEditValues({ ...editValues, status: val })}>
                                            <SelectTrigger className="mt-1 h-8 text-xs"><SelectValue /></SelectTrigger>
                                            <SelectContent>
                                              {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                            </SelectContent>
                                          </Select>
                                        </div>
                                      )}

                                      <div className="ml-auto flex items-center gap-1 pb-0.5">
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-success" onClick={saveInlineEdit}><CheckIcon className="h-4 w-4" /></Button>
                                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={cancelInlineEdit}><X className="h-4 w-4" /></Button>
                                      </div>
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
                                onClick={() => openAppointment(apt.id)}
                              >
                                {shouldShowColumn("serial") && (
                                  <td className="p-3 text-right text-xs text-muted-foreground tabular-nums">
                                    {/* The row's place in the whole list, not in the
                                        window the virtualizer happens to be drawing, and
                                        offset by the pages before this one - so it reads
                                        1..n down the list and 201 at the top of page 2. */}
                                    {(apptPage - 1) * APPT_PAGE_SIZE + virtualRow.index + 1}
                                  </td>
                                )}
                                {shouldShowColumn("patient") && (
                                  <td className="p-3 font-medium">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <PatientAvatar
                                        firstName={appointmentPatientInitials(apt).firstName}
                                        lastName={appointmentPatientInitials(apt).lastName}
                                        photoUrl={apt.patient_id ? appointmentAvatars[apt.patient_id] : undefined}
                                        className="h-8 w-8"
                                      />
                                      <span className="truncate">{appointmentPatientName(apt)}</span>
                                      {appointmentPatientIsVip(apt) && <VipBadge />}
                                    </div>
                                  </td>
                                )}
                                {shouldShowColumn("phone") && (
                                  <td className="p-3 text-muted-foreground">
                                    {patientPhone ? <span className="flex items-center gap-1 text-xs"><Phone className="h-3 w-3" />{patientPhone}</span> : "—"}
                                  </td>
                                )}
                                {/* Doctor is bold, and out of the muted grey the other
                                    secondary columns use: bold grey barely reads as bold,
                                    and this is one of the two names a clinician scans the
                                    list for. The em dash stays muted - an absence, not a
                                    name. */}
                                {shouldShowColumn("doctor") && (
                                  <td className="p-3 font-semibold">
                                    {getDoctorName(apt) || <span className="font-normal text-muted-foreground">—</span>}
                                  </td>
                                )}
                                {shouldShowColumn("therapist") && (
                                  <td className="p-3">
                                    {therapistDisplayName(apt) || <span className="text-muted-foreground">—</span>}
                                  </td>
                                )}
                                {shouldShowColumn("payment_mode") && (
                                  <td className="p-3 text-xs">
                                    {/* A bill paid two ways names each mode AND what went on
                                        it - "Card ₹26,939", "UPI ₹2,420". This column used to
                                        say only "Split", then only "Card + UPI", and the
                                        clinic's next question both times was how much on
                                        each. The amounts were in payment_splits all along.
                                        Exact, never abbreviated: these get reconciled against
                                        the drawer. See paymentSplits.ts. */}
                                    {(invoice?.bills ?? []).length > 1 ? (
                                      <span className="flex flex-col items-start gap-0.5">
                                        {invoice!.bills.map((bill, i) => (
                                          <PaymentModeCell
                                            key={bill.id ?? i}
                                            mode={bill.payment_mode}
                                            splits={bill.payment_splits}
                                          />
                                        ))}
                                      </span>
                                    ) : invoice?.payment_mode ? (
                                      <PaymentModeCell mode={invoice.payment_mode} splits={invoice.payment_splits} />
                                    ) : (
                                      <span className="text-muted-foreground">—</span>
                                    )}
                                  </td>
                                )}
                                {shouldShowColumn("bill") && (
                                  <td className="p-3 text-xs">{renderBillCell(invoice, apt, true)}</td>
                                )}
                                {shouldShowColumn("start_time") && (
                                  <td className="p-3 whitespace-nowrap">
                                    {/* Date and start time in one cell. dd/MM/yyyy via the
                                        app's own displayDate, because a browser left to
                                        format dates itself shows 09/24 on one clinic PC and
                                        24/09 on the next. The end time is still recorded and
                                        still edited in the row editor and the appointment
                                        sheet - it just does not earn width here. */}
                                    <p className="font-medium">{displayDate(apt.start_time)}</p>
                                    <p className="text-xs text-muted-foreground">{format(new Date(apt.start_time), "h:mm a")}</p>
                                  </td>
                                )}
                                {shouldShowColumn("service") && (
                                  <td className="p-3">
                                    {/* The Investigation text as Salesforce recorded it, which is
                                        what staff need to read - the resolved service name often
                                        collapses to "Consultation" and hides what was done. Falls
                                        back to the resolved name when there is no text.

                                        Clamped because imported data has put paragraphs in here;
                                        the column is table-fixed so truncate has a bounded width. */}
                                    <span className="block truncate" title={investigationText(apt)}>
                                      {investigationText(apt, "—")}
                                    </span>
                                  </td>
                                )}
                                {shouldShowColumn("status") && (
                                  <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                    {/* A dropdown is an edit. Without a badge to
                                        fall back to, somebody who may only read
                                        the list would still be handed the one
                                        control on it that changes a record. */}
                                    {!canEditAppt ? (
                                      <Badge className={cn("text-xs", showsAsBilled(apt.status, billInvoiceByAppointmentId.has(apt.id)) ? BILLED_BADGE_CLASSES : statusColor(apt.status))}>
                                        {appointmentStatusLabel(apt.status, billInvoiceByAppointmentId.has(apt.id))}
                                      </Badge>
                                    ) : (
                                    <Select value={apt.status} onValueChange={(val) => inlineUpdateMutation.mutate({
                                      id: apt.id,
                                      status: val,
                                      __notify: {
                                        phone: apt.patients?.phone || "",
                                        patientName: `${apt.patients?.first_name || ""} ${apt.patients?.last_name || ""}`.trim() || "Patient",
                                        prevStatus: apt.status,
                                        newStatus: val,
                                        startTime: apt.start_time,
                                        doctorName: getDoctorName(apt),
                                        serviceName: apt.service || "",
                                        patientGender: apt.patients?.gender || null,
                                      },
                                    })}>
                                      {/* Shrink-to-fit. It was a fixed w-28, which
                                          "Completed" very nearly filled - the shorter
                                          "Billed" left the remainder as a gap before the
                                          chevron, the trigger being justify-between. */}
                                      <SelectTrigger className="h-7 w-auto gap-1 text-xs border-0 bg-transparent p-0">
                                        <Badge className={cn("text-xs", showsAsBilled(apt.status, billInvoiceByAppointmentId.has(apt.id)) ? BILLED_BADGE_CLASSES : statusColor(apt.status))}>{appointmentStatusLabel(apt.status, billInvoiceByAppointmentId.has(apt.id))}</Badge>
                                      </SelectTrigger>
                                      <SelectContent>
                                        {statusOptions.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                      </SelectContent>
                                    </Select>
                                    )}
                                  </td>
                                )}
                                {showRowActions && (
                                <td className="p-3" onClick={(e) => e.stopPropagation()}>
                                  <div className="flex items-center gap-0.5">
                                    {canEditAppt && (
                                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startInlineEdit(apt)}>
                                      <Pencil className="h-3.5 w-3.5" />
                                    </Button>
                                    )}
                                    {canAddPrescription && (
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
                                        // No service in the URL: the form takes none from anybody
                                        // and opens with an empty line. See procedureFormSeed.ts.
                                        routerNavigate(`/procedures/new?${params.toString()}`);
                                      }}
                                    >
                                      <ClipboardList className="h-3.5 w-3.5" />
                                    </Button>
                                    )}
                                    {canDeleteAppt && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7 text-destructive"
                                      title="Delete appointment"
                                      onClick={() => setDeleteTarget({
                                        id: apt.id,
                                        label: `${appointmentPatientName(apt, "Appointment")} — ${format(new Date(apt.start_time), "MMM d, h:mm a")}`,
                                        fromSalesforce: !!apt.sf_id,
                                      })}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                    )}
                                  </div>
                                </td>
                                )}
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
                      <tr>
                        <td colSpan={visibleColumnWidths.length + 1} className="p-8 text-center text-muted-foreground">
                          {apptPageLoading ? "Loading…" : (
                            <>
                              {emptyAppointmentsMessage(narrowedBy)}
                              {narrowedBy.length > 0 && (
                                <Button
                                  variant="link"
                                  size="sm"
                                  className="h-auto p-0 ml-2 text-xs"
                                  onClick={clearListFilters}
                                >
                                  Clear filters
                                </Button>
                              )}
                            </>
                          )}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="p-3 border-t flex items-center justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    {viewHasFilters
                      ? `Page ${apptPage} of ${Math.max(1, Math.ceil(apptTotal / APPT_PAGE_SIZE))}`
                      : `Page ${apptPage}`}
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
                      disabled={!apptHasMore}
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
        fields={viewFields}
        defaultColumns={viewDefaultColumns}
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
        fields={viewFields}
        defaultColumns={viewDefaultColumns}
      />

      {/* Changing the date of a visit that already happened overwrites it, and
          the bill raised that day goes with it. Booking is offered first. */}
      <AlertDialog open={!!visitMovePrompt} onOpenChange={(o) => { if (!o) setVisitMovePrompt(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Book a new appointment instead?</AlertDialogTitle>
            <AlertDialogDescription>
              {appointmentPatientName(visitMovePrompt?.apt, "This patient")} was seen on{" "}
              {visitMovePrompt?.apt?.start_time
                ? format(new Date(visitMovePrompt.apt.start_time), "dd MMM yyyy")
                : "that day"}
              . {visitMovePrompt ? rescheduleWarning(visitMovePrompt.evidence) : ""} Changing the date to{" "}
              {visitMovePrompt?.newStart ? format(new Date(visitMovePrompt.newStart), "dd MMM yyyy") : "the new date"}{" "}
              removes that visit from the patient's history and takes the bill with it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bookInsteadMutation.isPending}>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              disabled={bookInsteadMutation.isPending}
              onClick={() => {
                visitMovePrompt?.proceed();
                setVisitMovePrompt(null);
              }}
            >
              Move it anyway
            </Button>
            <AlertDialogAction
              disabled={bookInsteadMutation.isPending}
              onClick={(e) => {
                e.preventDefault();
                bookInsteadMutation.mutate();
              }}
            >
              {bookInsteadMutation.isPending ? "Booking..." : "Book a new appointment"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
        // unlinked; notes and feedback are ON DELETE CASCADE and do not come back at
        // all. Worth saying plainly on a clinical record.
        //
        // "Notes" here means appointment_sticky_notes, what the Notes tab writes.
        // This used to say "therapy notes", naming a table no screen could write to.
        //
        // A Salesforce-sourced appointment gets an extra line: that delete used to
        // be undone by the next sync, and now that it holds, staff should know it
        // holds only here and not in Salesforce.
        note={appointmentDeleteNote(!!deleteTarget?.fromSalesforce)}
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
