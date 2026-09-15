import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PinOff,
  ExternalLink,
  Filter,
  Table as TableIcon,
  BarChart3,
  PieChart,
  LineChart,
  Hash,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ReportPreview } from "@/components/reports/ReportPreview";
import {
  CHART_TYPES,
  isValidFieldKey,
  type SavedReport,
  type ReportFilter,
} from "@/lib/reportObjects";

const chartIcons: Record<string, any> = {
  table: TableIcon,
  bar: BarChart3,
  doughnut: PieChart,
  line: LineChart,
  number: Hash,
};

interface Props {
  pinId: string;
  report: SavedReport;
  extraFilters: ReportFilter[];
  filteredByDashboard: boolean;
  onUnpin: (pinId: string) => void;
}

export function PinnedReportWidget({
  pinId,
  report,
  extraFilters,
  filteredByDashboard,
  onUnpin,
}: Props) {
  const navigate = useNavigate();

  // Sanitize stored field keys (same logic as ReportViewer)
  const allowed = [report.primary_object, report.related_object];
  const safeColumns = report.columns.filter((fk) => isValidFieldKey(fk, allowed));
  const safeGroupRows = report.group_rows.filter((fk) => isValidFieldKey(fk, allowed));
  const safeGroupCols = report.group_columns.filter((fk) => isValidFieldKey(fk, allowed));
  const safeFilters = report.filters.filter((f) => isValidFieldKey(f.field, allowed));

  const mergedFilters = [...safeFilters, ...extraFilters];

  const ChartIcon = chartIcons[report.chart_type] || TableIcon;
  const chartLabel =
    CHART_TYPES.find((c) => c.key === report.chart_type)?.label || report.chart_type;

  const updatedLabel = report.updated_at
    ? `Updated ${formatDistanceToNow(new Date(report.updated_at), { addSuffix: true })}`
    : "";

  const openFull = () => navigate(`/report-builder?view=${report.id}`);

  return (
    <div className="data-table flex flex-col overflow-hidden h-[320px]">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border flex items-start gap-2 shrink-0 bg-card">
        <button
          onClick={openFull}
          className="flex-1 min-w-0 text-left group"
          title="Open full report"
        >
          <div className="flex items-center gap-1.5">
            <h3 className="font-display font-semibold text-sm text-foreground truncate group-hover:text-primary">
              {report.name}
            </h3>
            <Badge variant="secondary" className="gap-1 text-[9px] h-4 px-1 shrink-0">
              <ChartIcon className="h-2.5 w-2.5" /> {chartLabel}
            </Badge>
            {filteredByDashboard && (
              <Badge variant="outline" className="gap-1 text-[9px] h-4 px-1 shrink-0">
                <Filter className="h-2.5 w-2.5" /> Filtered
              </Badge>
            )}
          </div>
          {updatedLabel && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">
              {updatedLabel}
            </p>
          )}
        </button>
        <div className="flex gap-0.5 shrink-0">
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            title="Open full report"
            onClick={openFull}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-muted-foreground hover:text-destructive"
            title="Unpin from dashboard"
            onClick={() => onUnpin(pinId)}
          >
            <PinOff className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Body — reuse the existing ReportPreview */}
      <div className="flex-1 overflow-auto p-2">
        <ReportPreview
          primaryObject={report.primary_object}
          relatedObject={report.related_object || ""}
          columns={safeColumns}
          groupRows={safeGroupRows}
          groupColumns={safeGroupCols}
          filters={mergedFilters}
          chartType={report.chart_type}
          displayOptions={report.display_options}
          compact
        />
      </div>
    </div>
  );
}
