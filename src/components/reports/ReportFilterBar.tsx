import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CalendarIcon, X, Search, Pin, PinOff } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { ReportFilterDef } from "@/lib/reportsCatalog";
import {
  REPORT_DATE_RANGE_OPTIONS,
  DEFAULT_REPORT_PRESET,
  getReportDateRange,
  saveReportPin,
  clearReportPin,
  loadReportPin,
} from "@/lib/reportDateRange";

export interface FilterState {
  search: string;
  dateFrom?: Date;
  dateTo?: Date;
  /** Preset key from REPORT_DATE_RANGE_OPTIONS (unused in single-day mode) */
  datePreset?: string;
  customStart?: string;
  customEnd?: string;
  selects: Record<string, string>; // filter key -> value ("" = all)
}

interface Props {
  filters: ReportFilterDef[];
  state: FilterState;
  onChange: (s: FilterState) => void;
  showSearch?: boolean;
  /**
   * Collapse the from/to range into one date picker, for accounts limited to
   * day-at-a-time reporting. The range is still what leaves this component - both
   * ends are just set to the same day.
   */
  singleDay?: boolean;
}

/** Clinicians only: Doctor and Referral Doctor roles. */
const isDoctorRole = (role?: string | null) => /doctor/i.test(role || "");

export function ReportFilterBar({ filters, state, onChange, showSearch = true, singleDay = false }: Props) {
  const dateRange = filters.find((f) => f.type === "dateRange");
  const selects = filters.filter((f) => f.type === "select");
  const hasDoctor = filters.some((f) => f.type === "doctor");
  const hasService = filters.some((f) => f.type === "service");
  const [pinned, setPinned] = useState(() => !!loadReportPin());

  const { data: doctors = [] } = useQuery({
    queryKey: ["report-doctors"],
    enabled: hasDoctor,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("id, first_name, last_name, role")
        .eq("is_active", true)
        .order("first_name");
      if (error) throw error;
      return (data ?? []).filter((s: any) => isDoctorRole(s.role));
    },
  });

  const { data: services = [] } = useQuery({
    queryKey: ["report-services"],
    enabled: hasService,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("services").select("id, name").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const preset = state.datePreset ?? DEFAULT_REPORT_PRESET;

  const applyPreset = (key: string, customStart?: string, customEnd?: string) => {
    const cs = customStart ?? state.customStart;
    const ce = customEnd ?? state.customEnd;
    const { start, end } = getReportDateRange(key, cs, ce);
    onChange({
      ...state,
      datePreset: key,
      customStart: cs,
      customEnd: ce,
      dateFrom: start,
      dateTo: end,
    });
  };

  const hasActive =
    !!state.search ||
    (!singleDay && preset !== DEFAULT_REPORT_PRESET) ||
    Object.values(state.selects).some((v) => v && v !== "all");

  // A limited account always has a day selected, so clearing must not drop back to
  // "any date" - that would be the whole restriction undone by one button.
  const clear = () => {
    if (singleDay) {
      onChange({ ...state, search: "", selects: {} });
      return;
    }
    const { start, end } = getReportDateRange(DEFAULT_REPORT_PRESET);
    onChange({
      search: "",
      datePreset: DEFAULT_REPORT_PRESET,
      customStart: state.customStart,
      customEnd: state.customEnd,
      dateFrom: start,
      dateTo: end,
      selects: {},
    });
  };

  const togglePin = () => {
    if (pinned) {
      clearReportPin();
      setPinned(false);
      toast.success("Pinned period removed");
      return;
    }
    saveReportPin({
      preset,
      customStart: state.customStart,
      customEnd: state.customEnd,
      doctor: state.selects.doctor || "",
      service: state.selects.service || "",
    });
    setPinned(true);
    toast.success("These filters will load with every report");
  };

  const setSelect = (key: string, v: string) =>
    onChange({ ...state, selects: { ...state.selects, [key]: v === "all" ? "" : v } });

  return (
    <div className="data-table p-3 mb-4">
      <div className="flex flex-wrap items-end gap-2">
        {showSearch && (
          <div className="flex-1 min-w-[180px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Search</label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={state.search}
                onChange={(e) => onChange({ ...state, search: e.target.value })}
                placeholder="Search…"
                className="h-8 pl-7 text-xs"
              />
            </div>
          </div>
        )}

        {dateRange && (
          singleDay ? (
            <DateField
              label={dateRange.label}
              value={state.dateFrom}
              clearable={false}
              onChange={(d) => {
                if (!d) return;
                onChange({ ...state, dateFrom: d, dateTo: d });
              }}
            />
          ) : (
            <>
              <div className="min-w-[160px]">
                <label className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {dateRange.label}
                </label>
                <Select value={preset} onValueChange={(v) => applyPreset(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {REPORT_DATE_RANGE_OPTIONS.map((o) => (
                      <SelectItem key={o.key} value={o.key} className="text-xs">{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {preset === "custom" && (
                <>
                  <div className="min-w-[130px]">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">From</label>
                    <Input
                      type="date"
                      value={state.customStart || ""}
                      onChange={(e) => applyPreset("custom", e.target.value, undefined)}
                      className="h-8 text-xs"
                    />
                  </div>
                  <div className="min-w-[130px]">
                    <label className="text-[10px] uppercase tracking-wide text-muted-foreground">To</label>
                    <Input
                      type="date"
                      value={state.customEnd || ""}
                      onChange={(e) => applyPreset("custom", undefined, e.target.value)}
                      className="h-8 text-xs"
                    />
                  </div>
                </>
              )}
            </>
          )
        )}

        {hasDoctor && (
          <div className="min-w-[150px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Doctor</label>
            <Select value={state.selects.doctor || "all"} onValueChange={(v) => setSelect("doctor", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all" className="text-xs">All Doctors</SelectItem>
                {doctors.map((d: any) => (
                  <SelectItem key={d.id} value={d.id} className="text-xs">
                    {d.first_name} {d.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {hasService && (
          <div className="min-w-[150px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">Service</label>
            <Select value={state.selects.service || "all"} onValueChange={(v) => setSelect("service", v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="all" className="text-xs">All Services</SelectItem>
                {services.map((s: any) => (
                  <SelectItem key={s.id} value={s.name} className="text-xs">{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {selects.map((f) => (
          <div key={f.key} className="min-w-[140px]">
            <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{f.label}</label>
            <Select value={state.selects[f.key] || "all"} onValueChange={(v) => setSelect(f.key, v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All</SelectItem>
                {f.options?.map((o) => (
                  <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}

        {!singleDay && (
          <Button
            size="sm"
            variant={pinned ? "default" : "outline"}
            className="h-8 text-xs"
            onClick={togglePin}
            title={pinned ? "Remove pinned period" : "Pin this period for all reports"}
          >
            {pinned ? <PinOff className="h-3.5 w-3.5 mr-1" /> : <Pin className="h-3.5 w-3.5 mr-1" />}
            {pinned ? "Unpin" : "Pin"}
          </Button>
        )}

        {hasActive && (
          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={clear}>
            <X className="h-3.5 w-3.5 mr-1" /> Clear
          </Button>
        )}
      </div>
    </div>
  );
}

function DateField({ label, value, onChange, clearable = true }: { label: string; value?: Date; onChange: (d?: Date) => void; clearable?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-w-[140px]">
      <label className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 w-full justify-start text-xs font-normal", !value && "text-muted-foreground")}>
            <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
            {value ? format(value, "dd MMM yyyy") : "Any"}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={value}
            onSelect={(d) => { onChange(d ?? undefined); setOpen(false); }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
          {value && clearable && (
            <div className="p-2 border-t">
              <Button size="sm" variant="ghost" className="w-full h-7 text-xs" onClick={() => { onChange(undefined); setOpen(false); }}>
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
