import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import type { DashboardTab } from "@/lib/dashboardTabs";

interface StaffMember {
  id: string;
  first_name: string;
  last_name: string;
  role: string;
  specialization: string;
}

interface Service {
  id: string;
  name: string;
}

interface Props {
  staffList: StaffMember[];
  serviceList: Service[];
  selectedStaff: string;
  selectedDateRange: string;
  selectedService: string;
  onStaffChange: (v: string) => void;
  onDateRangeChange: (v: string) => void;
  onServiceChange: (v: string) => void;
  dashboards: DashboardTab[];
  selectedDashboard: string;
  onDashboardChange: (v: string) => void;
  customStart: string;
  customEnd: string;
  onCustomStartChange: (v: string) => void;
  onCustomEndChange: (v: string) => void;
}

export const DATE_RANGE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last_7", label: "Last 7 Days" },
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "this_month", label: "Current Month" },
  { key: "last_month", label: "Last Month" },
  { key: "this_quarter", label: "Current Quarter" },
  { key: "last_quarter", label: "Last Quarter" },
  { key: "this_year", label: "Current Year" },
  { key: "last_year", label: "Last Year" },
  { key: "custom", label: "Custom Date Range" },
];

/** Only clinicians can be picked in the Doctor filter. */
export const isDoctorRole = (role?: string | null) => /doctor/i.test(role || "");

export function DashboardFilters({
  staffList,
  serviceList,
  selectedStaff,
  selectedDateRange,
  selectedService,
  onStaffChange,
  onDateRangeChange,
  onServiceChange,
  dashboards,
  selectedDashboard,
  onDashboardChange,
  customStart,
  customEnd,
  onCustomStartChange,
  onCustomEndChange,
}: Props) {
  const doctors = staffList.filter((s) => isDoctorRole(s.role));

  return (
    <div className="flex flex-wrap gap-2 mb-5">
      <Select value={selectedDashboard} onValueChange={onDashboardChange}>
        <SelectTrigger className="w-[210px] h-8 text-xs">
          <SelectValue placeholder="Dashboard" />
        </SelectTrigger>
        <SelectContent>
          {dashboards.map((d) => (
            <SelectItem key={d.id} value={d.id} className="text-xs">{d.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedStaff} onValueChange={onStaffChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue placeholder="All Doctors" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">All Doctors</SelectItem>
          {doctors.map((d) => (
            <SelectItem key={d.id} value={d.id} className="text-xs">
              {d.first_name} {d.last_name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={selectedDateRange} onValueChange={onDateRangeChange}>
        <SelectTrigger className="w-[160px] h-8 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {DATE_RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {selectedDateRange === "custom" && (
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={customStart}
            onChange={(e) => onCustomStartChange(e.target.value)}
            className="h-8 w-[140px] text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={customEnd}
            onChange={(e) => onCustomEndChange(e.target.value)}
            className="h-8 w-[140px] text-xs"
          />
        </div>
      )}

      <Select value={selectedService} onValueChange={onServiceChange}>
        <SelectTrigger className="w-[180px] h-8 text-xs">
          <SelectValue placeholder="All Services" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all" className="text-xs">All Services</SelectItem>
          {serviceList.map((s) => (
            <SelectItem key={s.id} value={s.name} className="text-xs">{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
