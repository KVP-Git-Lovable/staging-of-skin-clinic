import { SavedReport, CHART_TYPES, getObjectByKey } from "@/lib/reportObjects";
import { Button } from "@/components/ui/button";
import { Edit, Trash2, Play, BarChart3, PieChart, LineChart, Table, Hash, Folder, Pin, PinOff } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";

const chartIcon = (type: string) => {
  const icons: Record<string, any> = { table: Table, bar: BarChart3, doughnut: PieChart, line: LineChart, number: Hash };
  const Icon = icons[type] || Table;
  return <Icon className="h-4 w-4" />;
};

interface Props {
  reports: SavedReport[];
  onEdit: (r: SavedReport) => void;
  onDelete: (id: string) => void;
  onRun: (r: SavedReport) => void;
  folders?: { id: string; name: string }[];
  pinnedIds?: Set<string>;
  onTogglePin?: (r: SavedReport) => void;
}

export function ReportList({ reports, onEdit, onDelete, onRun, folders, pinnedIds, onTogglePin }: Props) {
  const getFolderName = (folderId?: string | null) => {
    if (!folderId || !folders) return null;
    return folders.find((f) => f.id === folderId)?.name;
  };

  return (
    <div className="grid gap-4">
      {reports.map((r) => {
        const primary = getObjectByKey(r.primary_object);
        const related = r.related_object ? getObjectByKey(r.related_object) : null;
        const chartLabel = CHART_TYPES.find((c) => c.key === r.chart_type)?.label || r.chart_type;
        const folderName = getFolderName(r.folder_id);

        return (
          <div
            key={r.id}
            className="data-table p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-md transition-shadow"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="font-display font-semibold text-foreground truncate">{r.name}</h3>
                <Badge variant="secondary" className="gap-1 text-xs shrink-0">
                  {chartIcon(r.chart_type)} {chartLabel}
                </Badge>
                {folderName && (
                  <Badge variant="outline" className="gap-1 text-[10px] shrink-0">
                    <Folder className="h-3 w-3" /> {folderName}
                  </Badge>
                )}
              </div>
              {r.description && (
                <p className="text-sm text-muted-foreground truncate">{r.description}</p>
              )}
              <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                <span>Primary: <strong className="text-foreground">{primary?.label}</strong></span>
                {related && (
                  <span>+ Related: <strong className="text-foreground">{related.label}</strong></span>
                )}
                <span>• {r.columns.length} columns</span>
                {r.filters.length > 0 && <span>• {r.filters.length} filters</span>}
                {r.updated_at && (
                  <span>• Updated {format(new Date(r.updated_at), "dd MMM yyyy")}</span>
                )}
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button size="sm" variant="outline" onClick={() => onRun(r)} className="gap-1">
                <Play className="h-3.5 w-3.5" /> View
              </Button>
              {onTogglePin && r.id && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onTogglePin(r)}
                  title={pinnedIds?.has(r.id) ? "Unpin from Dashboard" : "Pin to Dashboard"}
                  className={pinnedIds?.has(r.id) ? "text-primary" : ""}
                >
                  {pinnedIds?.has(r.id) ? (
                    <PinOff className="h-3.5 w-3.5" />
                  ) : (
                    <Pin className="h-3.5 w-3.5" />
                  )}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => onEdit(r)}>
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => r.id && onDelete(r.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
