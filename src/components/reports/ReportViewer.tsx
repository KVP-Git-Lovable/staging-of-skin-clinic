import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  ArrowLeft,
  Edit,
  Filter,
  Plus,
  Table,
  BarChart3,
  PieChart,
  LineChart,
  Hash,
  PanelRightClose,
  RotateCcw,
  Save,
  Pin,
  PinOff,
} from "lucide-react";
import {
  CHART_TYPES,
  getObjectByKey,
  DEFAULT_DISPLAY_OPTIONS,
  isValidFieldKey,
  type SavedReport,
  type ReportFilter,
  type ReportField,
  type ReportDisplayOptions,
} from "@/lib/reportObjects";
import { ReportPreview } from "./ReportPreview";
import { FilterRow } from "./FilterRow";

const chartIcons: Record<string, any> = {
  table: Table,
  bar: BarChart3,
  doughnut: PieChart,
  line: LineChart,
  number: Hash,
};

interface Props {
  report: SavedReport;
  onEdit: () => void;
  onClose: () => void;
}

export function ReportViewer({ report, onEdit, onClose }: Props) {
  const { user } = useAuth();
  const [isPinned, setIsPinned] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!user?.id || !report.id) {
      setIsPinned(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from("dashboard_pins")
        .select("id")
        .eq("user_id", user.id)
        .eq("report_id", report.id)
        .maybeSingle();
      if (!cancelled) setIsPinned(!!data);
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, report.id]);

  const togglePin = async () => {
    if (!user?.id || !report.id) {
      toast.error("Sign in to pin reports");
      return;
    }
    setPinBusy(true);
    if (isPinned) {
      const { error } = await supabase
        .from("dashboard_pins")
        .delete()
        .eq("user_id", user.id)
        .eq("report_id", report.id);
      if (error) toast.error("Failed to unpin");
      else {
        toast.success("Unpinned from Dashboard");
        setIsPinned(false);
      }
    } else {
      const { error } = await supabase
        .from("dashboard_pins")
        .insert({ user_id: user.id, report_id: report.id });
      if (error) toast.error("Failed to pin");
      else {
        toast.success("Pinned to Dashboard");
        setIsPinned(true);
      }
    }
    setPinBusy(false);
  };

  // Sanitize stored field keys so old reports with invalid columns
  // don't poison the query and produce "no records found".
  const allowed = [report.primary_object, report.related_object];
  const safeColumns = report.columns.filter((fk) => isValidFieldKey(fk, allowed));
  const safeGroupRows = report.group_rows.filter((fk) => isValidFieldKey(fk, allowed));
  const safeGroupColumns = report.group_columns.filter((fk) => isValidFieldKey(fk, allowed));
  const safeFilters = report.filters.filter((f) => isValidFieldKey(f.field, allowed));

  const [chartType, setChartType] = useState(report.chart_type);
  // Saved filters are fully editable at run time (field, operator, value) but
  // changes only affect the current run until the user saves them back.
  const [runFilters, setRunFilters] = useState<ReportFilter[]>(safeFilters);
  const [showFilters, setShowFilters] = useState(false);
  const [savingFilters, setSavingFilters] = useState(false);

  const [displayOptions, setDisplayOptions] = useState<ReportDisplayOptions>(
    report.display_options || { ...DEFAULT_DISPLAY_OPTIONS }
  );

  useEffect(() => {
    setRunFilters(report.filters.filter((f) => isValidFieldKey(f.field, allowed)));
    setDisplayOptions(report.display_options || { ...DEFAULT_DISPLAY_OPTIONS });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [report.id]);

  const primaryObj = getObjectByKey(report.primary_object);
  const relatedObj = report.related_object ? getObjectByKey(report.related_object) : null;

  const allFields: (ReportField & { objectKey: string; prefix: string })[] = [];
  if (primaryObj) {
    primaryObj.fields.forEach((f) =>
      allFields.push({ ...f, objectKey: report.primary_object, prefix: primaryObj.label })
    );
  }
  if (relatedObj && report.related_object) {
    relatedObj.fields.forEach((f) =>
      allFields.push({ ...f, objectKey: report.related_object!, prefix: relatedObj.label })
    );
  }

  const fieldKeyStr = (f: { objectKey: string; key: string }) => `${f.objectKey}.${f.key}`;

  const getFieldLabel = (fk: string) => {
    const [objKey, fldKey] = fk.split(".");
    const obj = getObjectByKey(objKey);
    return obj?.fields.find((f) => f.key === fldKey)?.label || fk;
  };

  const activeFilters = runFilters;

  const savedSnapshot = JSON.stringify({
    filters: safeFilters,
    logic: (report.display_options?.filter_logic || "").trim(),
  });
  const currentSnapshot = JSON.stringify({
    filters: runFilters,
    logic: (displayOptions.filter_logic || "").trim(),
  });
  const filtersDirty = savedSnapshot !== currentSnapshot;

  const updateRunFilter = (idx: number, patch: Partial<ReportFilter>) => {
    setRunFilters((p) => p.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  };

  const resetRunFilters = () => {
    setRunFilters(safeFilters);
    setDisplayOptions((p) => ({ ...p, filter_logic: report.display_options?.filter_logic || "" }));
  };

  const addFilter = () => {
    if (allFields.length === 0) return;
    const first = allFields[0];
    setRunFilters((p) => [
      ...p,
      { field: fieldKeyStr(first), operator: "equals", value: "", objectKey: first.objectKey },
    ]);
  };

  const removeFilter = (idx: number) => {
    setRunFilters((p) => p.filter((_, i) => i !== idx));
  };

  const saveFilters = async () => {
    if (!report.id) {
      toast.error("Save the report first");
      return;
    }
    setSavingFilters(true);
    const { error } = await supabase
      .from("saved_reports")
      .update({
        filters: runFilters as any,
        display_options: displayOptions as any,
      })
      .eq("id", report.id);
    setSavingFilters(false);
    if (error) {
      toast.error("Failed to save filters");
      return;
    }
    // Keep the in-memory report in sync so "modified" clears.
    report.filters = runFilters;
    report.display_options = displayOptions;
    toast.success("Filters saved to report");
  };

  const totalFilterCount = activeFilters.length;

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0 flex-wrap bg-card">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="font-display font-semibold text-sm text-foreground truncate max-w-[250px]">
          {report.name}
        </h1>
        <Badge variant="outline" className="text-[10px] shrink-0">{primaryObj?.label}</Badge>
        {relatedObj && <Badge variant="outline" className="text-[10px] shrink-0">+ {relatedObj.label}</Badge>}

        <div className="flex gap-0.5 shrink-0 ml-auto">
          {CHART_TYPES.map((ct) => {
            const Icon = chartIcons[ct.key] || Table;
            return (
              <Button
                key={ct.key}
                size="icon"
                variant={chartType === ct.key ? "default" : "ghost"}
                className="h-7 w-7"
                title={ct.label}
                onClick={() => setChartType(ct.key)}
              >
                <Icon className="h-3.5 w-3.5" />
              </Button>
            );
          })}
        </div>

        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={() => setShowFilters((p) => !p)}
        >
          <Filter className="h-3 w-3" />
          Filters
          {totalFilterCount > 0 && (
            <Badge variant="secondary" className="text-[9px] h-4 px-1 ml-0.5">{totalFilterCount}</Badge>
          )}
        </Button>

        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={onEdit}>
          <Edit className="h-3 w-3" /> Edit
        </Button>

        <Button
          variant={isPinned ? "default" : "outline"}
          size="sm"
          className="h-7 gap-1 text-xs"
          onClick={togglePin}
          disabled={pinBusy || !report.id}
          title={isPinned ? "Unpin from Dashboard" : "Pin to Dashboard"}
        >
          {isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
          {isPinned ? "Unpin" : "Pin"}
        </Button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Report content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-4 bg-background">
            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground flex-wrap">
              {report.description && <span>{report.description}</span>}
              {activeFilters.length > 0 && (
                <Badge variant="secondary" className="text-[10px]">
                  <Filter className="h-2.5 w-2.5 mr-1" /> {activeFilters.length} filter{activeFilters.length > 1 ? "s" : ""}
                </Badge>
              )}
            </div>

            <div className="data-table p-3">
              <ReportPreview
                primaryObject={report.primary_object}
                relatedObject={report.related_object || ""}
                columns={safeColumns}
                groupRows={safeGroupRows}
                groupColumns={safeGroupColumns}
                filters={activeFilters}
                chartType={chartType}
                displayOptions={displayOptions}
              />
            </div>
          </div>

          {/* Bottom toggles */}
          <div className="border-t border-border px-4 py-2 flex items-center gap-6 bg-card shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Row Counts</span>
              <Switch
                checked={displayOptions.show_row_counts}
                onCheckedChange={(v) => setDisplayOptions((p) => ({ ...p, show_row_counts: v }))}
                className="scale-75"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Subtotals</span>
              <Switch
                checked={displayOptions.show_subtotals}
                onCheckedChange={(v) => setDisplayOptions((p) => ({ ...p, show_subtotals: v }))}
                className="scale-75"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-muted-foreground">Grand Total</span>
              <Switch
                checked={displayOptions.show_grand_total}
                onCheckedChange={(v) => setDisplayOptions((p) => ({ ...p, show_grand_total: v }))}
                className="scale-75"
              />
            </div>
          </div>
        </div>

        {/* Right: Filters panel (toggled) */}
        {showFilters && (
          <div className="w-72 md:w-80 border-l border-border flex flex-col shrink-0 bg-card overflow-y-auto p-3">
            <div className="flex items-center justify-between mb-3">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Filters
              </Label>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setShowFilters(false)}>
                <PanelRightClose className="h-3.5 w-3.5" />
              </Button>
            </div>

            <div className="flex items-center justify-between mb-2">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                Saved Filters {filtersDirty && <span className="text-primary">(modified)</span>}
              </Label>
              {filtersDirty && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 px-1 text-[10px] gap-1"
                  onClick={resetRunFilters}
                  title="Reset to saved filters"
                >
                  <RotateCcw className="h-3 w-3" /> Reset
                </Button>
              )}
            </div>

            {runFilters.map((filter, idx) => (
              <div key={`f-${idx}`} className="mb-2">
                <FilterRow
                  filter={filter}
                  index={idx + 1}
                  allFields={allFields}
                  fieldKeyFn={fieldKeyStr}
                  onChange={(patch) => updateRunFilter(idx, patch)}
                  onRemove={() => removeFilter(idx)}
                />
              </div>
            ))}

            <Button size="sm" variant="outline" onClick={addFilter} className="w-full gap-1 text-xs h-7">
              <Plus className="h-3 w-3" /> Add Filter
            </Button>

            {runFilters.length > 1 && (
              <div className="mt-3">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1 block">
                  Filter Logic
                </Label>
                <Input
                  value={displayOptions.filter_logic || ""}
                  onChange={(e) => setDisplayOptions((p) => ({ ...p, filter_logic: e.target.value }))}
                  placeholder="e.g. 1 AND (2 OR 3)"
                  className="h-7 text-[11px]"
                />
                <p className="text-[10px] text-muted-foreground mt-1">
                  Leave blank to match all filters (AND).
                </p>
              </div>
            )}

            <Button
              size="sm"
              className="w-full gap-1 text-xs h-7 mt-3"
              disabled={!filtersDirty || savingFilters || !report.id}
              onClick={saveFilters}
            >
              <Save className="h-3 w-3" /> Save Filters to Report
            </Button>
            <p className="text-[10px] text-muted-foreground mt-1">
              Changes apply to this run only until you save them.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
