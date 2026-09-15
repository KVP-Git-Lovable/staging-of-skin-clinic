import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { formatMoney } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowDown, ArrowUp, ChevronsUpDown, Columns3, Download, ExternalLink, FileText, Search, X } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, Line, LineChart,
} from "recharts";

type Kind = "appointments" | "invoices" | "patients";

interface FieldDef {
  key: string;
  label: string;
  type?: "currency" | "date" | "datetime" | "badge";
  defaultOn?: boolean;
}

const FIELDS: Record<Kind, FieldDef[]> = {
  appointments: [
    { key: "patient", label: "Patient", defaultOn: true },
    { key: "phone", label: "Phone" },
    { key: "service", label: "Service", defaultOn: true },
    { key: "doctor", label: "Doctor", defaultOn: true },
    { key: "date", label: "Date", type: "date", defaultOn: true },
    { key: "time", label: "Time", defaultOn: true },
    { key: "status", label: "Status", type: "badge", defaultOn: true },
    { key: "visit_type", label: "Visit Type" },
    { key: "next_visit_status", label: "Next Visit" },
    { key: "notes", label: "Notes" },
    { key: "created_at", label: "Created", type: "datetime" },
  ],
  invoices: [
    { key: "invoice_number", label: "Invoice #", defaultOn: true },
    { key: "patient_name", label: "Patient", defaultOn: true },
    { key: "doctor", label: "Doctor", defaultOn: true },
    { key: "payment_mode", label: "Payment Mode", defaultOn: true },
    { key: "total_amount", label: "Amount", type: "currency", defaultOn: true },
    { key: "paid_amount", label: "Paid", type: "currency", defaultOn: true },
    { key: "balance", label: "Balance", type: "currency" },
    { key: "subtotal", label: "Subtotal", type: "currency" },
    { key: "tax_amount", label: "Tax", type: "currency" },
    { key: "discount_amount", label: "Discount", type: "currency" },
    { key: "status", label: "Status", type: "badge", defaultOn: true },
    { key: "created_at", label: "Invoice Date", type: "date", defaultOn: true },
  ],
  patients: [
    { key: "name", label: "Name", defaultOn: true },
    { key: "phone", label: "Phone", defaultOn: true },
    { key: "email", label: "Email", defaultOn: true },
    { key: "gender", label: "Gender", defaultOn: true },
    { key: "city", label: "City" },
    { key: "age", label: "Age" },
    { key: "created_at", label: "Added On", type: "date", defaultOn: true },
  ],
};

const CHART_COLORS = ["hsl(var(--primary))", "#22c55e", "#f59e0b", "#3b82f6", "#ef4444", "#a855f7", "#14b8a6", "#eab308"];

const KIND_LABEL: Record<Kind, string> = {
  appointments: "Appointments",
  invoices: "Invoices",
  patients: "Patients",
};

export default function DashboardExplore() {
  const [params] = useSearchParams();
  const kind = (params.get("kind") as Kind) || "appointments";
  const title = params.get("title") || KIND_LABEL[kind];
  const urlFrom = params.get("from") || "";
  const urlTo = params.get("to") || "";
  const urlStaff = params.get("staff") || "all";
  const urlService = params.get("service") || "all";
  const urlStatus = params.get("status") || "all";
  // Slice drill-downs from the dashboard charts
  const urlPaymentMode = params.get("payment_mode") || "";
  const urlProblemArea = params.get("problem_area") || "";

  const fields = FIELDS[kind];
  const [from, setFrom] = useState(urlFrom ? urlFrom.slice(0, 10) : "");
  const [to, setTo] = useState(urlTo ? urlTo.slice(0, 10) : "");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(urlStatus);
  const [staff, setStaff] = useState(urlStaff);
  const [service, setService] = useState(urlService);
  const [visible, setVisible] = useState<string[]>(fields.filter((f) => f.defaultOn).map((f) => f.key));
  const [chartType, setChartType] = useState("bar");
  const [groupBy, setGroupBy] = useState(kind === "invoices" ? "doctor" : kind === "patients" ? "gender" : "status");
  const [measure, setMeasure] = useState(kind === "invoices" ? "total_amount" : "count");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [sliceKey, setSliceKey] = useState<string | null>(null);

  const { data: staffList = [] } = useQuery({
    queryKey: ["explore-staff"],
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("id, first_name, last_name").eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });
  const staffName = useMemo(
    () => new Map(staffList.map((s: any) => [s.id, `${s.first_name} ${s.last_name}`])),
    [staffList]
  );

  // Primary-concern names, needed when the drill-down came from the
  // "Revenue by Primary Concern" chart (concerns live on the appointment).
  const { data: problemAreas = [] } = useQuery({
    queryKey: ["explore-problem-areas"],
    enabled: kind === "invoices",
    queryFn: async () => {
      const { data, error } = await supabase.from("problem_areas").select("id, name");
      if (error) throw error;
      return data || [];
    },
  });
  const areaName = useMemo(
    () => new Map((problemAreas as any[]).map((p) => [p.id, p.name])),
    [problemAreas]
  );

  const fromISO = from ? new Date(`${from}T00:00:00`).toISOString() : undefined;
  const toISO = to ? new Date(`${to}T23:59:59`).toISOString() : undefined;

  const { data: rows = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["explore", kind, fromISO, toISO],
    queryFn: async () => {
      if (kind === "appointments") {
        let q = supabase.from("appointments").select("*, patients(first_name, last_name, phone)").order("start_time", { ascending: false }).limit(5000);
        if (fromISO) q = q.gte("start_time", fromISO);
        if (toISO) q = q.lte("start_time", toISO);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      }
      if (kind === "invoices") {
        let q = supabase
          .from("invoices")
          .select("*, appointments(problem_area_ids)")
          .order("created_at", { ascending: false })
          .limit(5000);
        if (fromISO) q = q.gte("created_at", fromISO);
        if (toISO) q = q.lte("created_at", toISO);
        const { data, error } = await q;
        if (error) throw error;
        return data || [];
      }
      let q = supabase.from("patients").select("*").order("created_at", { ascending: false }).limit(5000);
      if (fromISO) q = q.gte("created_at", fromISO);
      if (toISO) q = q.lte("created_at", toISO);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    },
  });

  const normalized = useMemo(() => {
    return (rows as any[]).map((r) => {
      if (kind === "appointments") {
        const d = r.start_time ? new Date(r.start_time) : null;
        return {
          id: r.id,
          _staffId: r.staff_id,
          patient: r.patients ? `${r.patients.first_name} ${r.patients.last_name}` : r.patient_name || "Walk-in",
          phone: r.patients?.phone || r.patient_phone || "",
          service: r.service || "",
          doctor: r.staff_id ? staffName.get(r.staff_id) || "Unassigned" : "Unassigned",
          date: d ? format(d, "dd MMM yyyy") : "",
          time: d ? format(d, "h:mm a") : "",
          status: r.status || "",
          visit_type: r.visit_type || "",
          next_visit_status: r.next_visit_status || "",
          notes: r.notes || "",
          created_at: r.created_at,
        };
      }
      if (kind === "invoices") {
        return {
          id: r.id,
          _staffId: r.doctor_id,
          invoice_number: r.invoice_number,
          patient_name: r.patient_name || "Walk-in",
          doctor: r.doctor_id ? staffName.get(r.doctor_id) || "Unassigned" : "Walk-in / Direct",
          payment_mode: r.payment_mode || "",
          _areas: (((r.appointments?.problem_area_ids as string[]) || [])
            .map((id) => areaName.get(id))
            .filter(Boolean) as string[]),
          total_amount: Number(r.total_amount || 0),
          paid_amount: Number(r.paid_amount || 0),
          balance: Number(r.total_amount || 0) - Number(r.paid_amount || 0),
          subtotal: Number(r.subtotal || 0),
          tax_amount: Number(r.tax_amount || 0),
          discount_amount: Number(r.discount_amount || 0),
          status: r.status || "",
          created_at: r.created_at,
        };
      }
      return {
        id: r.id,
        name: `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Unnamed",
        phone: r.phone || "",
        email: r.email || "",
        gender: r.gender || "",
        city: r.city || "",
        age: r.age ?? "",
        created_at: r.created_at,
      };
    });
  }, [rows, kind, staffName, areaName]);

  const statusOptions = useMemo(
    () => Array.from(new Set(normalized.map((r: any) => r.status).filter(Boolean))).sort(),
    [normalized]
  );
  const serviceOptions = useMemo(
    () => Array.from(new Set(normalized.map((r: any) => r.service).filter(Boolean))).sort(),
    [normalized]
  );
  const doctorOptions = useMemo(
    () => Array.from(new Set(normalized.map((r: any) => r._staffId).filter(Boolean))) as string[],
    [normalized]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return normalized.filter((r: any) => {
      if (status !== "all" && r.status !== status) return false;
      if (staff !== "all" && r._staffId !== staff) return false;
      if (service !== "all" && r.service !== service) return false;
      if (urlPaymentMode) {
        const mode = r.payment_mode || "Unspecified";
        if (mode !== urlPaymentMode) return false;
      }
      if (urlProblemArea) {
        const areas: string[] = r._areas?.length ? r._areas : ["Unspecified"];
        if (!areas.includes(urlProblemArea)) return false;
      }
      if (q && !fields.some((f) => String(r[f.key] ?? "").toLowerCase().includes(q))) return false;
      return true;
    });
  }, [normalized, search, status, staff, service, fields, urlPaymentMode, urlProblemArea]);

  const chartData = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach((r: any) => {
      const key = String(r[groupBy] ?? "—") || "—";
      map[key] = (map[key] || 0) + (measure === "count" ? 1 : Number(r[measure] || 0));
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: Math.round(value) }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [filtered, groupBy, measure]);

  // Clicking a chart slice narrows the table to that group; clicking outside clears it.
  const sliced = useMemo(() => {
    if (!sliceKey) return filtered;
    return filtered.filter((r: any) => (String(r[groupBy] ?? "—") || "—") === sliceKey);
  }, [filtered, sliceKey, groupBy]);

  const visibleRows = useMemo(() => {
    if (!sort) return sliced;
    const def = fields.find((f) => f.key === sort.key);
    const copy = [...sliced];
    copy.sort((a: any, b: any) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (av == null || av === "") return 1;
      if (bv == null || bv === "") return -1;
      let cmp: number;
      if (def?.type === "currency" || typeof av === "number") cmp = Number(av) - Number(bv);
      else if (def?.type === "date" || def?.type === "datetime") cmp = new Date(av).getTime() - new Date(bv).getTime();
      else cmp = String(av).localeCompare(String(bv));
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [sliced, sort, fields]);

  const toggleSort = (key: string) =>
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });

  const recordHref = (r: any) =>
    kind === "appointments" ? `/appointments/${r.id}`
      : kind === "invoices" ? `/billing?viewInvoice=${r.id}`
      : `/patients/${r.id}`;

  const openRecord = (r: any) => window.open(recordHref(r), "_blank", "noopener");

  const fmt = (f: FieldDef, v: any) => {
    if (v === null || v === undefined || v === "") return "—";
    if (f.type === "currency") return formatMoney(Number(v));
    if (f.type === "date") return format(new Date(v), "dd MMM yyyy");
    if (f.type === "datetime") return format(new Date(v), "dd MMM yyyy h:mm a");
    return String(v);
  };

  const cols = fields.filter((f) => visible.includes(f.key));

  const exportXls = () => {
    const data = visibleRows.map((r: any) => {
      const o: Record<string, any> = {};
      cols.forEach((c) => { o[c.label] = c.type === "date" || c.type === "datetime" ? fmt(c, r[c.key]) : r[c.key] ?? ""; });
      return o;
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), KIND_LABEL[kind]);
    XLSX.writeFile(wb, `${title.replace(/[^\w]+/g, "-").toLowerCase()}.xlsx`);
  };

  const exportPdf = () => window.print();

  return (
    <div className="p-4 md:p-6 print:p-0">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="page-title">{title}</h1>
          <p className="page-subtitle">{visibleRows.length} record{visibleRows.length === 1 ? "" : "s"}</p>
        </div>
        <div className="flex gap-2 print:hidden">
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
                <Columns3 className="h-3.5 w-3.5" /> Columns
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-56 max-h-[300px] overflow-auto">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-2 py-1 text-xs cursor-pointer">
                  <Checkbox
                    checked={visible.includes(f.key)}
                    onCheckedChange={(c) =>
                      setVisible((prev) => (c ? [...prev, f.key] : prev.filter((k) => k !== f.key)))
                    }
                  />
                  {f.label}
                </label>
              ))}
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={exportXls}>
            <Download className="h-3.5 w-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={exportPdf}>
            <FileText className="h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="data-table p-3 mb-4 flex flex-wrap items-end gap-2 print:hidden">
        <div className="flex-1 min-w-[180px]">
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</label>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8 pl-7 text-xs" />
          </div>
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-8 w-[140px] text-xs" />
        </div>
        <div>
          <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-8 w-[140px] text-xs" />
        </div>
        {kind !== "patients" && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All statuses</SelectItem>
                {statusOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        {kind !== "patients" && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Doctor</label>
            <Select value={staff} onValueChange={setStaff}>
              <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All doctors</SelectItem>
                {doctorOptions.map((id) => (
                  <SelectItem key={id} value={id} className="text-xs">{staffName.get(id) || "Unassigned"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {kind === "appointments" && (
          <div>
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Service</label>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All services</SelectItem>
                {serviceOptions.map((s) => <SelectItem key={s} value={s} className="text-xs">{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Chart */}
      <div className="data-table p-3 mb-4">
        <div className="flex flex-wrap items-center gap-2 mb-3 print:hidden">
          <Select value={chartType} onValueChange={setChartType}>
            <SelectTrigger className="h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="bar" className="text-xs">Bar chart</SelectItem>
              <SelectItem value="pie" className="text-xs">Pie chart</SelectItem>
              <SelectItem value="line" className="text-xs">Line chart</SelectItem>
              <SelectItem value="none" className="text-xs">No chart</SelectItem>
            </SelectContent>
          </Select>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {fields.filter((f) => f.type !== "currency").map((f) => (
                <SelectItem key={f.key} value={f.key} className="text-xs">Group by {f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={measure} onValueChange={setMeasure}>
            <SelectTrigger className="h-8 w-[170px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="count" className="text-xs">Record count</SelectItem>
              {fields.filter((f) => f.type === "currency").map((f) => (
                <SelectItem key={f.key} value={f.key} className="text-xs">Sum of {f.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {chartType !== "none" && chartData.length > 0 && (
          <div onClick={() => setSliceKey(null)}>
            <ResponsiveContainer width="100%" height={280}>
              {chartType === "pie" ? (
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    outerRadius={100}
                    label
                    onClick={(d: any, i: number) => {
                      const name = d?.name ?? chartData[i]?.name;
                      setSliceKey((prev) => (prev === name ? null : name));
                    }}
                  >
                    {chartData.map((d, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        opacity={sliceKey && sliceKey !== d.name ? 0.35 : 1}
                        className="cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip /><Legend />
                </PieChart>
              ) : chartType === "line" ? (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="value"
                    stroke={CHART_COLORS[0]}
                    strokeWidth={2}
                    activeDot={{
                      onClick: (_e: any, p: any) => {
                        const name = p?.payload?.name;
                        setSliceKey((prev) => (prev === name ? null : name));
                      },
                    }}
                  />
                </LineChart>
              ) : (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar
                    dataKey="value"
                    fill={CHART_COLORS[0]}
                    radius={[4, 4, 0, 0]}
                    className="cursor-pointer"
                    onClick={(d: any) => {
                      const name = d?.name ?? d?.payload?.name;
                      setSliceKey((prev) => (prev === name ? null : name));
                    }}
                  >
                    {chartData.map((d, i) => (
                      <Cell key={i} fill={CHART_COLORS[0]} opacity={sliceKey && sliceKey !== d.name ? 0.35 : 1} />
                    ))}
                  </Bar>
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
        {sliceKey && (
          <div className="mt-2 flex items-center gap-2 text-xs print:hidden">
            <Badge variant="secondary" className="text-[10px]">Showing: {sliceKey}</Badge>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
              onClick={() => setSliceKey(null)}
            >
              <X className="h-3 w-3" /> Clear selection
            </button>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="data-table overflow-auto">
        {isError ? (
          <div className="p-6 text-center text-sm">
            Could not load the data.{" "}
            <Button size="sm" variant="outline" className="ml-2" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading…</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No records found</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {cols.map((c) => {
                  const active = sort?.key === c.key;
                  const Icon = active ? (sort?.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                  return (
                    <TableHead key={c.key} className="text-xs whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className={`inline-flex items-center gap-1 hover:text-foreground ${active ? "text-foreground" : ""}`}
                        title="Sort ascending / descending / clear"
                      >
                        {c.label}
                        <Icon className="h-3 w-3" />
                      </button>
                    </TableHead>
                  );
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleRows.map((r: any) => (
                <TableRow
                  key={r.id}
                  className="cursor-pointer hover:bg-primary/5"
                  onClick={() => openRecord(r)}
                  title="Open record in a new tab"
                >
                  {cols.map((c, idx) => (
                    <TableCell key={c.key} className={`text-xs whitespace-nowrap ${idx === 0 ? "text-primary font-medium" : ""}`}>
                      {c.type === "badge"
                        ? <Badge variant="secondary" className="text-[10px]">{r[c.key] || "—"}</Badge>
                        : fmt(c, r[c.key])}
                      {idx === 0 && <ExternalLink className="inline h-3 w-3 ml-1 opacity-50" />}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
