import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  ExternalLink,
  Trash2,
  ChevronUp,
  ChevronDown,
  Table as TableIcon,
  BarChart3,
  BarChartHorizontal,
  PieChart,
  LineChart,
  Hash,
  Settings2,
} from "lucide-react";
import { ReportPreview } from "@/components/reports/ReportPreview";
import { isValidFieldKey, type SavedReport } from "@/lib/reportObjects";
import { useReportSchema } from "@/lib/reportSchema";
import { mergeWidgetOptions } from "@/lib/dashboardWidgets";

export type ComponentWidth = "small" | "medium" | "large";
export type ComponentHeight = "short" | "medium" | "tall";

export interface DashboardComponent {
  id: string;
  dashboard_id: string;
  report_id: string;
  title: string | null;
  chart_type: string | null;
  width: ComponentWidth;
  height: ComponentHeight;
  position: number;
  config?: any;
  report?: SavedReport | null;
}

export const WIDTH_CLASS: Record<ComponentWidth, string> = {
  small: "md:col-span-2",
  medium: "md:col-span-3",
  large: "md:col-span-6",
};

export const HEIGHT_PX: Record<ComponentHeight, number> = {
  short: 260,
  medium: 360,
  tall: 520,
};

export const chartIcons: Record<string, any> = {
  table: TableIcon,
  bar: BarChart3,
  hbar: BarChartHorizontal,
  doughnut: PieChart,
  line: LineChart,
  number: Hash,
};

interface Props {
  component: DashboardComponent;
  editing?: boolean;
  canEdit?: boolean;
  onRemove?: (id: string) => void;
  onMove?: (id: string, dir: -1 | 1) => void;
  onConfigure?: (component: DashboardComponent) => void;
  /** Preview mode inside the Edit Widget dialog: no toolbar, fixed height. */
  previewMode?: boolean;
}

export function DashboardComponentCard({
  component,
  editing = false,
  canEdit = false,
  onRemove,
  onMove,
  onConfigure,
  previewMode = false,
}: Props) {
  const navigate = useNavigate();
  useReportSchema();
  const report = component.report;
  const opts = mergeWidgetOptions(component.config);

  if (!report) {
    return (
      <div className={`data-table p-4 text-sm text-muted-foreground ${WIDTH_CLASS[component.width]}`}>
        This report is no longer available.
        {canEdit && onRemove && (
          <Button size="sm" variant="ghost" className="ml-2" onClick={() => onRemove(component.id)}>
            Remove
          </Button>
        )}
      </div>
    );
  }

  const chartType = component.chart_type || report.chart_type;

  const allowed = [report.primary_object, report.related_object];
  const safeColumns = report.columns.filter((fk) => isValidFieldKey(fk, allowed));
  const safeGroupRows = report.group_rows.filter((fk) => isValidFieldKey(fk, allowed));
  const safeGroupCols = report.group_columns.filter((fk) => isValidFieldKey(fk, allowed));
  const safeFilters = report.filters.filter((f) => isValidFieldKey(f.field, allowed));

  const openFull = () => {
    if (opts.custom_link) {
      window.open(opts.custom_link, "_blank", "noopener,noreferrer");
      return;
    }
    navigate(`/report-builder?view=${report.id}`);
  };

  const asOf = new Date().toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <div
      className={`${opts.theme === "dark" ? "dark" : ""} ${previewMode ? "" : WIDTH_CLASS[component.width]}`}
    >
      <div
        className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md"
        style={{ height: previewMode ? 340 : HEIGHT_PX[component.height] }}
      >
        {/* Header — Salesforce widget style */}
        <div className="px-4 pt-3 pb-2 flex items-start gap-2 shrink-0">
          <button onClick={openFull} className="flex-1 min-w-0 text-left group" title="Open full report">
            <h3 className="font-display font-semibold text-[15px] leading-tight text-foreground truncate group-hover:underline">
              {component.title || report.name}
            </h3>
            {opts.subtitle && (
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{opts.subtitle}</p>
            )}
          </button>
          {!previewMode && (
            <div className="flex gap-0.5 shrink-0">
              {editing && canEdit && (
                <>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Move up" onClick={() => onMove?.(component.id, -1)}>
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Move down" onClick={() => onMove?.(component.id, 1)}>
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-6 w-6" title="Edit widget" onClick={() => onConfigure?.(component)}>
                    <Settings2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-destructive"
                    title="Remove from dashboard"
                    onClick={() => onRemove?.(component.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              <Button size="icon" variant="ghost" className="h-6 w-6" title="Open full report" onClick={openFull}>
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-3">
          <ReportPreview
            primaryObject={report.primary_object}
            relatedObject={report.related_object || ""}
            columns={safeColumns}
            groupRows={safeGroupRows}
            groupColumns={safeGroupCols}
            filters={safeFilters}
            chartType={chartType}
            displayOptions={report.display_options}
            widget={opts}
            compact
          />
        </div>

        {/* Footer — Salesforce "View Report (...)" line */}
        <div className="px-4 py-2 border-t border-border/60 shrink-0">
          {opts.footer && <p className="text-[11px] text-muted-foreground mb-1 truncate">{opts.footer}</p>}
          <div className="flex items-center justify-between gap-2">
            {opts.show_view_report !== false ? (
              <button onClick={openFull} className="text-[11px] text-primary hover:underline truncate">
                View Report ({report.name})
              </button>
            ) : (
              <span />
            )}
            <span className="text-[10px] text-muted-foreground shrink-0">As of {asOf}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
