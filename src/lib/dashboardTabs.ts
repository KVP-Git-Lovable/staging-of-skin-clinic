/** Named dashboards on the home overview: which widgets each one shows. */
export interface DashboardTab {
  id: string;
  name: string;
  widgets: string[];
}

export const DASHBOARD_WIDGETS = [
  { key: "appointments_total", label: "Total Appointments" },
  { key: "appointments_confirmed", label: "Confirmed Appointments" },
  { key: "appointments_completed", label: "Completed Appointments" },
  { key: "revenue", label: "Revenue" },
  { key: "staff_present", label: "Staff Present" },
  { key: "new_patients", label: "New Patients Added" },
  { key: "total_patients", label: "Total Patients" },
  { key: "active_campaigns", label: "Active Campaigns" },
  { key: "pinned_reports", label: "Pinned Reports" },
  { key: "charts", label: "Charts" },
  { key: "today_appointments", label: "Today's Appointments" },
  { key: "pending_invoices", label: "Pending Invoices" },
  { key: "revenue_by_service", label: "Revenue by Service" },
  { key: "appointment_trend", label: "Appointment Trend" },
];

/** Dashboards are defined here (driven from the prompt), never edited in the UI. */
export const DEFAULT_DASHBOARDS: DashboardTab[] = [
  {
    id: "dr360",
    name: "Clinic 360 Dashboard",
    widgets: [
      "appointments_total",
      "appointments_confirmed",
      "appointments_completed",
      "revenue",
      "pinned_reports",
      "charts",
      "revenue_by_service",
      "appointment_trend",
    ],
  },
  {
    id: "patient360",
    name: "Patient 360 Dashboard",
    widgets: ["new_patients", "total_patients", "today_appointments", "pending_invoices"],
  },
  {
    id: "marketing360",
    name: "Marketing 360 Dashboard",
    widgets: ["active_campaigns", "charts"],
  },
  {
    id: "team360",
    name: "Team 360",
    widgets: ["staff_present"],
  },
];

/** Old localStorage entries (including user-created dashboards) are discarded. */
export function loadDashboardTabs(): DashboardTab[] {
  try {
    localStorage.removeItem("dashboard-tabs-v1");
  } catch {
    /* ignore */
  }
  return DEFAULT_DASHBOARDS;
}

export interface PinnedDashboardFilters {
  dashboard: string;
  staff: string;
  dateRange: string;
  service: string;
  customStart: string;
  customEnd: string;
}

const PIN_KEY = "dashboard-pinned-filters-v1";

export function loadPinnedFilters(): PinnedDashboardFilters | null {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PinnedDashboardFilters;
    if (!p || typeof p !== "object") return null;
    if (!DEFAULT_DASHBOARDS.some((d) => d.id === p.dashboard)) p.dashboard = DEFAULT_DASHBOARDS[0].id;
    return p;
  } catch {
    return null;
  }
}

export function savePinnedFilters(p: PinnedDashboardFilters) {
  try {
    localStorage.setItem(PIN_KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}

export function clearPinnedFilters() {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    /* ignore */
  }
}
