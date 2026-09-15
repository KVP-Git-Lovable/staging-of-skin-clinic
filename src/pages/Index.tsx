import { Button } from "@/components/ui/button";
import { useState, useMemo, useEffect } from "react";
import { Users, Calendar, IndianRupee, UserCheck, Clock, Receipt, ClipboardList, AlertCircle, Megaphone, Pin, PinOff } from "lucide-react";
import { StatCard } from "@/components/dashboard/StatCard";
import { DashboardFilters, DATE_RANGE_OPTIONS } from "@/components/dashboard/DashboardFilters";
import { DashboardCharts } from "@/components/dashboard/DashboardCharts";
import { PinnedReports } from "@/components/dashboard/PinnedReports";
import {
  DEFAULT_DASHBOARDS, loadDashboardTabs, loadPinnedFilters, savePinnedFilters,
  clearPinnedFilters, type DashboardTab,
} from "@/lib/dashboardTabs";
import { Badge } from "@/components/ui/badge";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  format, startOfDay, endOfDay, subDays, startOfWeek, endOfWeek,
  startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter,
  startOfYear, endOfYear, subYears, eachDayOfInterval,
  eachHourOfInterval, eachWeekOfInterval, differenceInDays,
} from "date-fns";
import { useNavigate } from "react-router-dom";
import { useMoneyFormat } from "@/lib/currency";
import { formatMoneyCompact } from "@/lib/currency";


// Data-heavy panels are capped so a large date range can never turn into a
// full-table scan that the database cancels (statement timeout).
const DASH_ROW_CAP = 5000;
const NEW_PATIENTS_CAP = 500;

const statusColors: Record<string, string> = {
  Reserved: "bg-info/10 text-info",
  Confirmed: "bg-primary/10 text-primary",
  "Checked In": "bg-warning/10 text-warning",
  Scheduled: "bg-info/10 text-info",
  Completed: "bg-success/10 text-success",
  Cancelled: "bg-destructive/10 text-destructive",
  "In Progress": "bg-warning/10 text-warning",
  "No Show": "bg-destructive/10 text-destructive",
};

const invoiceStatusColors: Record<string, string> = {
  Paid: "bg-success/10 text-success",
  Partial: "bg-warning/10 text-warning",
  Pending: "bg-destructive/10 text-destructive",
};

function getDateRange(key: string, customStart?: string, customEnd?: string): { start: Date; end: Date } {
  const now = new Date();
  switch (key) {
    case "yesterday": {
      const d = subDays(now, 1);
      return { start: startOfDay(d), end: endOfDay(d) };
    }
    case "last_7":
      return { start: startOfDay(subDays(now, 6)), end: endOfDay(now) };
    case "this_week":
      return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfDay(now) };
    case "last_week": {
      const s = startOfWeek(subDays(now, 7), { weekStartsOn: 1 });
      return { start: s, end: endOfWeek(s, { weekStartsOn: 1 }) };
    }
    case "this_month":
      return { start: startOfMonth(now), end: endOfDay(now) };
    case "last_month": {
      const m = subMonths(now, 1);
      return { start: startOfMonth(m), end: endOfMonth(m) };
    }
    case "this_quarter":
      return { start: startOfQuarter(now), end: endOfDay(now) };
    case "last_quarter": {
      const q = subMonths(startOfQuarter(now), 1);
      return { start: startOfQuarter(q), end: endOfQuarter(q) };
    }
    case "this_year":
      return { start: startOfYear(now), end: endOfDay(now) };
    case "last_year": {
      const y = subYears(now, 1);
      return { start: startOfYear(y), end: endOfYear(y) };
    }
    case "custom": {
      const s = customStart ? startOfDay(new Date(customStart)) : startOfDay(now);
      const e = customEnd ? endOfDay(new Date(customEnd)) : endOfDay(now);
      return { start: s, end: e < s ? endOfDay(s) : e };
    }
    default:
      return { start: startOfDay(now), end: endOfDay(now) };
  }
}


const Index = () => {
  const navigate = useNavigate();
  const { formatMoney } = useMoneyFormat();
  const [selectedStaff, setSelectedStaff] = useState("all");
  const [selectedDateRange, setSelectedDateRange] = useState("today");
  const [selectedService, setSelectedService] = useState("all");
  const [customStart, setCustomStart] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
  const [customEnd, setCustomEnd] = useState(format(new Date(), "yyyy-MM-dd"));
  const [dashboards, setDashboards] = useState<DashboardTab[]>(DEFAULT_DASHBOARDS);
  const [selectedDashboard, setSelectedDashboard] = useState(DEFAULT_DASHBOARDS[0].id);
  const [hasPin, setHasPin] = useState(false);

  useEffect(() => {
    const tabs = loadDashboardTabs();
    setDashboards(tabs);
    const pinned = loadPinnedFilters();
    if (pinned) {
      setSelectedDashboard(pinned.dashboard);
      setSelectedStaff(pinned.staff);
      setSelectedDateRange(pinned.dateRange);
      setSelectedService(pinned.service);
      if (pinned.customStart) setCustomStart(pinned.customStart);
      if (pinned.customEnd) setCustomEnd(pinned.customEnd);
      setHasPin(true);
    } else {
      setSelectedDashboard(tabs[0].id);
    }
  }, []);

  const activeDashboard = dashboards.find((d) => d.id === selectedDashboard) || dashboards[0];
  const shows = (key: string) => !!activeDashboard?.widgets.includes(key);

  const pickDashboard = (id: string) => setSelectedDashboard(id);

  const pinCurrent = () => {
    savePinnedFilters({
      dashboard: selectedDashboard,
      staff: selectedStaff,
      dateRange: selectedDateRange,
      service: selectedService,
      customStart,
      customEnd,
    });
    setHasPin(true);
    toast.success("These filters will load every time you sign in");
  };

  const unpin = () => {
    clearPinnedFilters();
    setHasPin(false);
    toast.success("Pinned filters removed");
  };

  const { start, end } = useMemo(
    () => getDateRange(selectedDateRange, customStart, customEnd),
    [selectedDateRange, customStart, customEnd]
  );
  const startISO = start.toISOString();
  const endISO = end.toISOString();


  // Queries
  const { data: staffList = [] } = useQuery({
    queryKey: ["staff-active-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name, role, specialization").eq("is_active", true).order("first_name");
      if (error) throw error;
      return data;
    },
  });

  const { data: serviceList = [] } = useQuery({
    queryKey: ["dashboard-services"],
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: appointments = [], isError: apptError, refetch: refetchAppts } = useQuery({
    queryKey: ["dashboard-appointments", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*, patients(first_name, last_name)")
        .gte("start_time", startISO)
        .lte("start_time", endISO)
        .order("start_time")
        .limit(DASH_ROW_CAP);
      if (error) throw error;
      return data;
    },
  });

  const { data: invoices = [], isError: invoiceError, refetch: refetchInvoices } = useQuery({
    queryKey: ["dashboard-invoices", startISO, endISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: false })
        .limit(DASH_ROW_CAP);
      if (error) throw error;
      return data;
    },
  });

  const { data: pendingInvoices = [] } = useQuery({
    queryKey: ["dashboard-pending-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices").select("*")
        .in("status", ["Pending", "Partial"])
        .order("created_at", { ascending: false }).limit(5);
      if (error) throw error;
      return data;
    },
  });

  const { data: totalPatients = 0 } = useQuery({
    queryKey: ["dashboard-patient-count"],
    queryFn: async () => {
      const { count, error } = await supabase.from("patients").select("*", { count: "exact", head: true });
      if (error) throw error;
      return count || 0;
    },
  });

  const { data: todayAttendance = [] } = useQuery({
    queryKey: ["dashboard-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("*, staff(first_name, last_name, role)")
        .eq("date", format(new Date(), "yyyy-MM-dd"));
      if (error) throw error;
      return data;
    },
  });

  const { data: activeCampaigns = [] } = useQuery({
    queryKey: ["dashboard-active-campaigns"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campaigns" as any).select("id, amount_spent").eq("status", "Active");
      if (error) throw error;
      return (data as any[]) || [];
    },
  });

  const { data: problemAreas = [] } = useQuery({
    queryKey: ["dashboard-problem-areas"],
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: newPatients = { rows: [] as any[], count: 0 } } = useQuery({
    queryKey: ["dashboard-new-patients", startISO, endISO],
    queryFn: async () => {
      // Count comes from the database; only a capped slice of rows is pulled
      // down for the drill-down list.
      const { data, error, count } = await supabase
        .from("patients")
        .select("id, first_name, last_name, phone, email, gender, created_at", { count: "exact" })
        .gte("created_at", startISO)
        .lte("created_at", endISO)
        .order("created_at", { ascending: false })
        .limit(NEW_PATIENTS_CAP);
      if (error) throw error;
      return { rows: data || [], count: count || 0 };
    },
  });
  const newPatientsRaw = newPatients.rows;

  const doctorLookup = useMemo(
    () => new Map(staffList.map((d: any) => [d.id, `${d.first_name} ${d.last_name}`])),
    [staffList]
  );
  const areaLookup = useMemo(
    () => new Map((problemAreas as any[]).map((p) => [p.id, p.name])),
    [problemAreas]
  );
  const apptById = useMemo(() => new Map(appointments.map((a: any) => [a.id, a])), [appointments]);

  // Filter appointments
  const filtered = useMemo(() => {
    let list = appointments as any[];
    if (selectedStaff !== "all") list = list.filter((a: any) => a.staff_id === selectedStaff);
    if (selectedService !== "all") list = list.filter((a: any) => a.service === selectedService);
    return list.map((a: any) => ({
      ...a,
      _staffName: a.staff_id ? doctorLookup.get(a.staff_id) || "Unassigned" : "Unassigned",
    }));
  }, [appointments, selectedStaff, selectedService, doctorLookup]);

  // Filter invoices by staff/service (via doctor_id or linked appointment) and enrich
  const filteredInvoices = useMemo(() => {
    const apptIds = new Set(filtered.map((a: any) => a.id));
    let list = (invoices as any[]).filter((inv: any) => inv.status !== "Cancelled");
    if (selectedStaff !== "all" || selectedService !== "all") {
      list = list.filter(
        (inv: any) =>
          (inv.appointment_id && apptIds.has(inv.appointment_id)) ||
          (selectedService === "all" && selectedStaff !== "all" && inv.doctor_id === selectedStaff)
      );
    }
    return list.map((inv: any) => {
      const appt = inv.appointment_id ? apptById.get(inv.appointment_id) : null;
      const staffId = inv.doctor_id || appt?.staff_id;
      return {
        ...inv,
        _doctorName: staffId ? doctorLookup.get(staffId) || "Unassigned" : "Walk-in / Direct",
        _areas: ((appt?.problem_area_ids as string[]) || [])
          .map((id) => areaLookup.get(id))
          .filter(Boolean) as string[],
        _serviceNames: (() => {
          const fromInv = Array.isArray((inv as any).services)
            ? ((inv as any).services as any[])
                .map((x) => (typeof x === "string" ? x : x?.name || x?.service_name))
                .filter(Boolean)
            : [];
          if (fromInv.length) return fromInv as string[];
          return appt?.service ? [appt.service as string] : ["Unspecified"];
        })(),
      };
    });
  }, [invoices, filtered, selectedStaff, selectedService, apptById, doctorLookup, areaLookup]);

  // Chart data
  const chartData = useMemo(() => {
    // Status pie
    const statusMap: Record<string, number> = {};
    filtered.forEach((a: any) => { statusMap[a.status] = (statusMap[a.status] || 0) + 1; });
    const appointmentStatus = Object.entries(statusMap).map(([name, value]) => ({ name, value }));

    // Appointments by Staff
    const drApptMap: Record<string, number> = {};
    filtered.forEach((a: any) => {
      drApptMap[a._staffName] = (drApptMap[a._staffName] || 0) + 1;
    });
    let appointmentsByDr = Object.entries(drApptMap)
      .map(([name, value]) => ({ name, value }))
      .filter((d) => !(d.name === "Unassigned" && d.value === 0))
      .sort((a, b) => b.value - a.value);
    if (appointmentsByDr.length > 8) {
      const top = appointmentsByDr.slice(0, 8);
      const other = appointmentsByDr.slice(8).reduce((s, x) => s + x.value, 0);
      appointmentsByDr = [...top, { name: "Other", value: other }];
    }

    // Revenue by Doctor
    const drBillPaid: Record<string, number> = {};
    const drBillInvoiced: Record<string, number> = {};
    const areaRevenue: Record<string, number> = {};
    const modeRevenue: Record<string, number> = {};
    const serviceRevenue: Record<string, number> = {};
    filteredInvoices.forEach((inv: any) => {
      const drName = inv._doctorName || "Walk-in / Direct";
      const paid = Number(inv.paid_amount || 0);
      drBillPaid[drName] = (drBillPaid[drName] || 0) + paid;
      drBillInvoiced[drName] = (drBillInvoiced[drName] || 0) + Number(inv.total_amount || 0);

      const billed = Number(inv.total_amount || 0);
      const areas: string[] = inv._areas?.length ? inv._areas : ["Unspecified"];
      areas.forEach((a) => { areaRevenue[a] = (areaRevenue[a] || 0) + billed / areas.length; });

      const svcs: string[] = inv._serviceNames?.length ? inv._serviceNames : ["Unspecified"];
      svcs.forEach((sv) => { serviceRevenue[sv] = (serviceRevenue[sv] || 0) + billed / svcs.length; });

      const mode = inv.payment_mode || "Unspecified";
      modeRevenue[mode] = (modeRevenue[mode] || 0) + billed;
    });
    const revenueByDr = Object.keys({ ...drBillPaid, ...drBillInvoiced })
      .map((name) => ({ name, paid: drBillPaid[name] || 0, invoiced: drBillInvoiced[name] || 0 }))
      .sort((a, b) => b.invoiced - a.invoiced)
      .slice(0, 10);
    const revenueByProblemArea = Object.entries(areaRevenue)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
    const revenueByPaymentMode = Object.entries(modeRevenue)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value);

    // Revenue Trend — bucket by hour / day / week based on selected range length
    const rangeDays = Math.max(1, differenceInDays(end, start) + 1);
    let buckets: Date[];
    let bucketKey: (d: Date) => string;
    let bucketLabel: (d: Date) => string;
    if (rangeDays <= 1) {
      buckets = eachHourOfInterval({ start, end });
      bucketKey = (d) => format(d, "yyyy-MM-dd HH");
      bucketLabel = (d) => format(d, "h a");
    } else if (rangeDays <= 31) {
      buckets = eachDayOfInterval({ start, end });
      bucketKey = (d) => format(d, "yyyy-MM-dd");
      bucketLabel = (d) => format(d, "dd MMM");
    } else {
      buckets = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 });
      bucketKey = (d) => format(startOfWeek(d, { weekStartsOn: 1 }), "yyyy-MM-dd");
      bucketLabel = (d) => `Wk ${format(startOfWeek(d, { weekStartsOn: 1 }), "dd MMM")}`;
    }
    const paidByBucket: Record<string, number> = {};
    const invByBucket: Record<string, number> = {};
    const labelByBucket: Record<string, string> = {};
    buckets.forEach((b) => {
      const k = bucketKey(b);
      paidByBucket[k] = 0;
      invByBucket[k] = 0;
      labelByBucket[k] = bucketLabel(b);
    });
    filteredInvoices.forEach((inv: any) => {
      const k = bucketKey(new Date(inv.created_at));
      if (paidByBucket[k] !== undefined) {
        paidByBucket[k] += Number(inv.paid_amount || 0);
        invByBucket[k] += Number(inv.total_amount || 0);
      }
    });
    const revenueByDate = Object.keys(paidByBucket).map((k) => ({
      date: labelByBucket[k],
      paid: paidByBucket[k],
      invoiced: invByBucket[k],
    }));

    // Appointment Trend — completed appointments per bucket (same buckets as revenue trend)
    const completedByBucket: Record<string, number> = {};
    Object.keys(paidByBucket).forEach((k) => { completedByBucket[k] = 0; });
    filtered.forEach((a: any) => {
      if (a.status !== "Completed") return;
      const k = bucketKey(new Date(a.start_time));
      if (completedByBucket[k] !== undefined) completedByBucket[k] += 1;
    });
    const appointmentsByDate = Object.keys(completedByBucket).map((k) => ({
      date: labelByBucket[k],
      completed: completedByBucket[k],
    }));

    const revenueByService = Object.entries(serviceRevenue)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .filter((d) => d.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);

    return { appointmentStatus, appointmentsByDr, revenueByDr, revenueByProblemArea, revenueByPaymentMode, revenueByDate, revenueByService, appointmentsByDate };
  }, [filtered, filteredInvoices, start, end]);

  // Stat card values
  const paidRevenue = filteredInvoices.reduce((s, inv: any) => s + Number(inv.paid_amount || 0), 0);
  const invoicedRevenue = filteredInvoices.reduce((s, inv: any) => s + Number(inv.total_amount || 0), 0);
  const completedCount = filtered.filter((a: any) => a.status === "Completed").length;
  const scheduledCount = filtered.filter((a: any) => a.status === "Scheduled").length;
  const confirmedAppts = filtered.filter((a: any) => a.status === "Confirmed");
  const completedAppts = filtered.filter((a: any) => a.status === "Completed");
  const checkedInStaff = todayAttendance.filter((a: any) => a.check_in_time).length;
  const pendingAmount = pendingInvoices.reduce((s, inv: any) => s + (Number(inv.total_amount) - Number(inv.paid_amount)), 0);
  const dateLabel = DATE_RANGE_OPTIONS.find((o) => o.key === selectedDateRange)?.label || "Today";

  // Drill-down — opens the full explorer page in a new tab
  const openDrill = (
    kind: "invoices" | "appointments" | "patients",
    title: string,
    extra: Record<string, string> = {}
  ) => {
    const qs = new URLSearchParams({
      kind,
      title,
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      staff: selectedStaff,
      service: selectedService,
      ...extra,
    });
    window.open(`/dashboard-explore?${qs.toString()}`, "_blank", "noopener,noreferrer");
  };

  const staffIdByName = (name?: string) =>
    (staffList as any[]).find((s) => `${s.first_name} ${s.last_name}` === name)?.id;

  const handleChartClick = (type: string, key?: string) => {
    const suffix = key ? ` — ${key}` : "";
    switch (type) {
      case "appointment_status":
        return openDrill("appointments", `Appointments — Status${suffix}`, key ? { status: key } : {});
      case "appointments_by_dr": {
        const id = staffIdByName(key);
        return openDrill("appointments", `Appointments — By Doctor${suffix}`, id ? { staff: id } : {});
      }
      case "revenue_by_dr": {
        const id = staffIdByName(key);
        return openDrill("invoices", `Revenue by Doctor${suffix}`, id ? { staff: id } : {});
      }
      case "appointment_trend":
        return openDrill("appointments", `Appointment Trend — Completed${suffix}`, { status: "Completed" });
      case "revenue_by_service":
        return openDrill("invoices", `Revenue by Service${suffix}`, key && key !== "Unspecified" ? { service: key } : {});
      case "revenue_by_problem_area":
        return openDrill("invoices", `Revenue by Primary Concern${suffix}`, key ? { problem_area: key } : {});
      case "revenue_by_payment_mode":
        return openDrill("invoices", `Revenue by Payment Mode${suffix}`, key ? { payment_mode: key } : {});
      default:
        return openDrill("invoices", "Revenue — Detail");
    }
  };

  // Today appointments for the list (always today, unfiltered by date range)
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();
  const todayAppts = useMemo(() => {
    return appointments.filter((a: any) => {
      const t = new Date(a.start_time);
      return t >= new Date(todayStart) && t <= new Date(todayEnd);
    });
  }, [appointments, todayStart, todayEnd]);

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{activeDashboard?.name || "Dashboard"}</h1>
        <p className="page-subtitle hidden sm:block">Clinic overview for {format(new Date(), "EEEE, MMMM d")}</p>
      </div>

      {(apptError || invoiceError) && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <span className="text-sm text-destructive">
            Some dashboard data took too long to load. Try a shorter date range, or retry.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => { refetchAppts(); refetchInvoices(); }}
          >
            Retry
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={pinCurrent}>
          <Pin className="h-3 w-3" /> Pin these filters
        </Button>
        {hasPin && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={unpin}>
            <PinOff className="h-3 w-3" /> Remove pin
          </Button>
        )}
      </div>

      <DashboardFilters
        staffList={staffList}
        serviceList={serviceList}
        selectedStaff={selectedStaff}
        selectedDateRange={selectedDateRange}
        selectedService={selectedService}
        onStaffChange={setSelectedStaff}
        onDateRangeChange={setSelectedDateRange}
        onServiceChange={setSelectedService}
        dashboards={dashboards}
        selectedDashboard={selectedDashboard}
        onDashboardChange={pickDashboard}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-4 items-stretch auto-rows-fr">
        {shows("appointments_total") && (
          <div className="cursor-pointer h-full" onClick={() => openDrill("appointments", `Total Appointments — ${dateLabel}`)}>
            <StatCard title="Total Appointments" value={filtered.length} change={dateLabel} changeType="neutral" icon={Calendar} iconColor="bg-info/10 text-info" delay={0} />
          </div>
        )}
        {shows("appointments_confirmed") && (
          <div className="cursor-pointer h-full" onClick={() => openDrill("appointments", `Confirmed Appointments — ${dateLabel}`, { status: "Confirmed" })}>
            <StatCard title="Confirmed Appointments" value={confirmedAppts.length} change={`${scheduledCount} scheduled • ${dateLabel}`} changeType="neutral" icon={ClipboardList} iconColor="bg-primary/10 text-primary" delay={0.05} />
          </div>
        )}
        {shows("appointments_completed") && (
          <div className="cursor-pointer h-full" onClick={() => openDrill("appointments", `Completed Appointments — ${dateLabel}`, { status: "Completed" })}>
            <StatCard title="Completed Appointments" value={completedCount} change={dateLabel} changeType="positive" icon={UserCheck} iconColor="bg-success/10 text-success" delay={0.1} />
          </div>
        )}
        {shows("new_patients") && (
          <div className="cursor-pointer h-full" onClick={() => openDrill("patients", `New Patients — ${dateLabel}`)}>
            <StatCard title="New Patients Added" value={newPatients.count} change={dateLabel} changeType="neutral" icon={Users} delay={0.15} />
          </div>
        )}
        {shows("revenue") && (
          <div className="cursor-pointer h-full" onClick={() => openDrill("invoices", `Revenue — ${dateLabel}`)}>
            <StatCard title="Revenue" value={formatMoneyCompact(paidRevenue)} change={`of ${formatMoneyCompact(invoicedRevenue)} invoiced • ${dateLabel}`} changeType="positive" icon={IndianRupee} iconColor="bg-success/10 text-success" delay={0.2} />
          </div>
        )}
        {shows("total_patients") && (
          <div className="cursor-pointer h-full" onClick={() => openDrill("patients", "Total Patients", { from: "", to: "" })}>
            <StatCard title="Total Patients" value={totalPatients} change="All time" changeType="neutral" icon={Users} delay={0.22} />
          </div>
        )}
        {shows("staff_present") && (
          <StatCard title="Staff Present" value={`${checkedInStaff}`} change="Today" changeType="neutral" icon={UserCheck} iconColor="bg-warning/10 text-warning" delay={0.24} />
        )}
        {shows("active_campaigns") && (
          <div onClick={() => navigate("/campaigns")} className="cursor-pointer h-full">
            <StatCard
              title="Active Campaigns"
              value={activeCampaigns.length}
              change={`${formatMoneyCompact(activeCampaigns.reduce((s, c: any) => s + Number(c.amount_spent || 0), 0))} total spend`}
              changeType="neutral"
              icon={Megaphone}
              iconColor="bg-primary/10 text-primary"
              delay={0.2}
            />
          </div>
        )}
      </div>

      {(shows("charts") || shows("revenue_by_service") || shows("appointment_trend")) && (
        <DashboardCharts
          data={shows("charts") ? chartData : ({ ...chartData, appointmentStatus: [], appointmentsByDr: [], revenueByDr: [], revenueByProblemArea: [], revenueByPaymentMode: [], revenueByDate: [] } as any)}
          onChartClick={handleChartClick}
          showRevenueByService={shows("revenue_by_service")}
          showAppointmentTrend={shows("appointment_trend")}
        />
      )}

      {shows("pinned_reports") && <PinnedReports start={start} end={end} staffId={selectedStaff} />}



      {/* Lists section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
        {shows("today_appointments") && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }} className="lg:col-span-2 data-table">

          <div className="p-4 md:p-5 border-b flex items-center justify-between">
            <h2 className="font-display font-semibold text-base md:text-lg">Today's Appointments</h2>
            <button onClick={() => navigate("/appointments")} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="divide-y max-h-[320px] overflow-y-auto">
            {todayAppts.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">No appointments for today</div>
            ) : (
              todayAppts.map((apt: any) => (
                <div key={apt.id} className="flex items-center justify-between p-3 md:p-4 hover:bg-muted/50 transition-colors gap-2 cursor-pointer" onClick={() => navigate("/appointments")}>
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-display font-semibold text-xs shrink-0">
                      {apt.patients ? `${apt.patients.first_name[0]}${apt.patients.last_name[0]}` : apt.patient_name?.[0] || "?"}
                    </div>
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{apt.patients ? `${apt.patients.first_name} ${apt.patients.last_name}` : apt.patient_name || "Walk-in"}</p>
                      <p className="text-xs text-muted-foreground truncate">{apt.service}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="hidden sm:inline text-xs text-muted-foreground">{format(new Date(apt.start_time), "h:mm a")}</span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${statusColors[apt.status] || "bg-muted"}`}>{apt.status}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </motion.div>
        )}

        {shows("pending_invoices") && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }} className="data-table">

          <div className="p-4 md:p-5 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-display font-semibold text-base md:text-lg">Pending Invoices</h2>
            </div>
            <button onClick={() => navigate("/billing")} className="text-xs text-primary hover:underline">View All</button>
          </div>
          <div className="divide-y max-h-[280px] overflow-y-auto">
            {pendingInvoices.length === 0 ? (
              <div className="p-6 text-center text-muted-foreground text-sm">No pending invoices 🎉</div>
            ) : (
              pendingInvoices.map((inv: any) => (
                <div key={inv.id} className="p-3 md:p-4 hover:bg-muted/50 transition-colors cursor-pointer" onClick={() => navigate("/billing")}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm text-primary underline">{inv.invoice_number}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${invoiceStatusColors[inv.status]}`}>{inv.status}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="truncate mr-2">{inv.patient_name || "Walk-in"}</span>
                    <span className="font-medium text-foreground whitespace-nowrap">{formatMoney(Number(inv.total_amount) - Number(inv.paid_amount))}</span>
                  </div>
                </div>
              ))
            )}
          </div>
          {pendingAmount > 0 && (
            <div className="p-3 md:p-4 border-t bg-destructive/5">
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">{formatMoney(pendingAmount)} total pending</span>
              </div>
            </div>
          )}
        </motion.div>
        )}
      </div>

    </div>
  );
};

export default Index;
