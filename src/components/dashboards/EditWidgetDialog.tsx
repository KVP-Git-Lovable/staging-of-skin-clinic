import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CHART_TYPES, getObjectByKey } from "@/lib/reportObjects";
import {
  DEFAULT_WIDGET_OPTIONS,
  LEGEND_POSITIONS,
  SORT_OPTIONS,
  mergeWidgetOptions,
  type WidgetOptions,
} from "@/lib/dashboardWidgets";
import {
  chartIcons,
  DashboardComponentCard,
  type ComponentHeight,
  type ComponentWidth,
  type DashboardComponent,
} from "@/components/dashboards/DashboardComponentCard";

interface Props {
  component: DashboardComponent | null;
  onClose: () => void;
  onSave: (patch: {
    title: string | null;
    chart_type: string | null;
    width: ComponentWidth;
    height: ComponentHeight;
    config: WidgetOptions;
  }) => void;
}

export function EditWidgetDialog({ component, onClose, onSave }: Props) {
  const [title, setTitle] = useState("");
  const [chart, setChart] = useState("default");
  const [width, setWidth] = useState<ComponentWidth>("medium");
  const [height, setHeight] = useState<ComponentHeight>("medium");
  const [opts, setOpts] = useState<WidgetOptions>({ ...DEFAULT_WIDGET_OPTIONS });

  useEffect(() => {
    if (!component) return;
    setTitle(component.title || "");
    setChart(component.chart_type || "default");
    setWidth(component.width);
    setHeight(component.height);
    setOpts(mergeWidgetOptions(component.config));
  }, [component]);

  if (!component) return null;

  const report = component.report;
  const effectiveChart = chart === "default" ? report?.chart_type || "table" : chart;
  const set = (patch: Partial<WidgetOptions>) => setOpts((p) => ({ ...p, ...patch }));

  // Numeric fields available as the "measure" for summary-number widgets.
  const measureFields = [report?.primary_object, report?.related_object]
    .filter(Boolean)
    .flatMap((objKey) => {
      const obj = getObjectByKey(objKey as string);
      if (!obj) return [];
      return obj.fields
        .filter((f) => f.type === "number")
        .map((f) => ({ key: `${obj.key}.${f.key}`, label: `${obj.label}: ${f.label}` }));
    });

  const previewComponent: DashboardComponent = {
    ...component,
    title: title.trim() || null,
    chart_type: chart === "default" ? null : chart,
    config: opts,
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle className="text-center text-xl">Edit Widget</DialogTitle>
        </DialogHeader>

        <div className="grid md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-border max-h-[70vh]">
          {/* Settings */}
          <div className="overflow-y-auto p-5 space-y-4">
            <div>
              <Label className="text-xs">Report</Label>
              <Input value={report?.name || ""} readOnly className="bg-muted/40" />
            </div>

            <div>
              <Label className="text-xs">Display As</Label>
              <div className="flex flex-wrap gap-2 mt-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={chart === "default" ? "default" : "outline"}
                  className="h-9 text-xs"
                  onClick={() => setChart("default")}
                >
                  Report default
                </Button>
                {CHART_TYPES.map((c) => {
                  const Icon = chartIcons[c.key] || chartIcons.table;
                  return (
                    <Button
                      key={c.key}
                      type="button"
                      size="icon"
                      variant={chart === c.key ? "default" : "outline"}
                      className="h-9 w-9"
                      title={c.label}
                      onClick={() => setChart(c.key)}
                    >
                      <Icon className="h-4 w-4" />
                    </Button>
                  );
                })}
              </div>
            </div>

            {effectiveChart === "number" && (
              <div>
                <Label className="text-xs">Measure</Label>
                <Select value={opts.measure || "record_count"} onValueChange={(v) => set({ measure: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="record_count">Record Count</SelectItem>
                    {measureFields.map((f) => (
                      <SelectItem key={f.key} value={f.key}>Sum of {f.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Display Units</Label>
                <Select value={opts.display_units} onValueChange={(v: any) => set({ display_units: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="full">Full Number</SelectItem>
                    <SelectItem value="shortened">Shortened Number</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Decimal Places</Label>
                <Select value={String(opts.decimals)} onValueChange={(v: any) => set({ decimals: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">Automatic</SelectItem>
                    <SelectItem value="0">0</SelectItem>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Sort By</Label>
                <Select value={opts.sort_by} onValueChange={(v: any) => set({ sort_by: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Max Groups Displayed</Label>
                <Input
                  type="number"
                  min={1}
                  value={opts.max_groups ?? 100}
                  onChange={(e) => set({ max_groups: Number(e.target.value) || 1 })}
                />
              </div>
            </div>

            <div>
              <Label className="text-xs">Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={report?.name || "Widget title"} />
            </div>
            <div>
              <Label className="text-xs">Subtitle</Label>
              <Input value={opts.subtitle || ""} onChange={(e) => set({ subtitle: e.target.value })} />
            </div>
            <div>
              <Label className="text-xs">Footer</Label>
              <Input value={opts.footer || ""} onChange={(e) => set({ footer: e.target.value })} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Legend Position</Label>
                <Select value={opts.legend_position} onValueChange={(v: any) => set({ legend_position: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEGEND_POSITIONS.map((l) => (
                      <SelectItem key={l.key} value={l.key}>{l.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Custom Link</Label>
                <Input
                  value={opts.custom_link || ""}
                  onChange={(e) => set({ custom_link: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Width</Label>
                <Select value={width} onValueChange={(v: any) => setWidth(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="small">Small (1/3)</SelectItem>
                    <SelectItem value="medium">Medium (1/2)</SelectItem>
                    <SelectItem value="large">Full width</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Height</Label>
                <Select value={height} onValueChange={(v: any) => setHeight(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="short">Short</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="tall">Tall</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-xs">Widget Theme</Label>
              <div className="flex gap-2 mt-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={opts.theme !== "dark" ? "default" : "outline"}
                  onClick={() => set({ theme: "light" })}
                >
                  Light
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={opts.theme === "dark" ? "default" : "outline"}
                  onClick={() => set({ theme: "dark" })}
                >
                  Dark
                </Button>
              </div>
            </div>

            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={opts.show_view_report !== false}
                onCheckedChange={(c) => set({ show_view_report: !!c })}
              />
              Show &quot;View Report&quot; link
            </label>
          </div>

          {/* Live preview */}
          <div className="overflow-y-auto p-5 bg-muted/20">
            <p className="text-xs font-semibold text-muted-foreground mb-3">Preview</p>
            <DashboardComponentCard component={previewComponent} previewMode />
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() =>
              onSave({
                title: title.trim() || null,
                chart_type: chart === "default" ? null : chart,
                width,
                height,
                config: opts,
              })
            }
          >
            Update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
