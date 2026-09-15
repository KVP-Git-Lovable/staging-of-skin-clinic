import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Plus,
  RefreshCw,
  Pencil,
  Check,
  LayoutDashboard,
  Users,
  Lock,
  Search,
} from "lucide-react";
import { CHART_TYPES, type SavedReport } from "@/lib/reportObjects";
import {
  DashboardComponentCard,
  type DashboardComponent,
} from "@/components/dashboards/DashboardComponentCard";
import { EditWidgetDialog } from "@/components/dashboards/EditWidgetDialog";

interface DashboardRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_shared: boolean;
  updated_at: string;
}

const normalizeReport = (r: any): SavedReport => ({
  ...r,
  columns: r.columns || [],
  group_rows: r.group_rows || [],
  group_columns: r.group_columns || [],
  filters: r.filters || [],
  display_options: r.display_options || undefined,
});

const DashboardView = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [dashboard, setDashboard] = useState<DashboardRow | null>(null);
  const [components, setComponents] = useState<DashboardComponent[]>([]);
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Add-component dialog
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Edit Widget dialog
  const [configTarget, setConfigTarget] = useState<DashboardComponent | null>(null);

  const canEdit = !!user?.id && dashboard?.owner_id === user.id;

  const fetchAll = async () => {
    if (!id) return;
    setLoading(true);
    const [dashRes, compRes, repRes] = await Promise.all([
      supabase.from("dashboards" as any).select("*").eq("id", id).maybeSingle(),
      supabase
        .from("dashboard_components" as any)
        .select("*, saved_reports(*)")
        .eq("dashboard_id", id)
        .order("position", { ascending: true }),
      supabase.from("saved_reports").select("*").order("name"),
    ]);

    if (dashRes.error || !dashRes.data) {
      toast.error("Dashboard not found");
      setLoading(false);
      return;
    }
    setDashboard(dashRes.data as any);
    setComponents(
      ((compRes.data as any[]) || []).map((c: any) => ({
        ...c,
        report: c.saved_reports ? normalizeReport(c.saved_reports) : null,
      }))
    );
    setReports(((repRes.data as any[]) || []).map(normalizeReport));
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const usedReportIds = useMemo(() => new Set(components.map((c) => c.report_id)), [components]);

  const filteredReports = useMemo(() => {
    const q = search.trim().toLowerCase();
    return reports.filter((r) => !q || r.name.toLowerCase().includes(q) || (r.description || "").toLowerCase().includes(q));
  }, [reports, search]);

  const addComponent = async (report: SavedReport) => {
    if (!id || !report.id) return;
    const { data, error } = await supabase
      .from("dashboard_components" as any)
      .insert({
        dashboard_id: id,
        report_id: report.id,
        chart_type: report.chart_type,
        width: "medium",
        height: "medium",
        position: components.length,
      } as any)
      .select("*, saved_reports(*)")
      .single();
    if (error) return toast.error("Failed to add report");
    setComponents((prev) => [
      ...prev,
      { ...(data as any), report: normalizeReport((data as any).saved_reports) },
    ]);
    toast.success(`${report.name} added`);
  };

  const removeComponent = async (compId: string) => {
    const { error } = await supabase.from("dashboard_components" as any).delete().eq("id", compId);
    if (error) return toast.error("Failed to remove component");
    setComponents((prev) => prev.filter((c) => c.id !== compId));
  };

  const moveComponent = async (compId: string, dir: -1 | 1) => {
    const idx = components.findIndex((c) => c.id === compId);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= components.length) return;
    const next = [...components];
    [next[idx], next[target]] = [next[target], next[idx]];
    const reordered = next.map((c, i) => ({ ...c, position: i }));
    setComponents(reordered);
    await Promise.all(
      reordered.map((c) =>
        supabase.from("dashboard_components" as any).update({ position: c.position } as any).eq("id", c.id)
      )
    );
  };

  const openConfigure = (component: DashboardComponent) => setConfigTarget(component);

  const saveConfigure = async (patch: any) => {
    if (!configTarget) return;
    const { error } = await supabase
      .from("dashboard_components" as any)
      .update(patch as any)
      .eq("id", configTarget.id);
    if (error) return toast.error("Failed to save widget");
    setComponents((prev) =>
      prev.map((c) => (c.id === configTarget.id ? ({ ...c, ...patch } as DashboardComponent) : c))
    );
    setConfigTarget(null);
    toast.success("Widget updated");
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading dashboard...</div>;
  }

  if (!dashboard) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-muted-foreground">
        <p>This dashboard is not available.</p>
        <Button variant="outline" onClick={() => navigate("/dashboards")}>Back to Dashboards</Button>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2 min-w-0">
          <Button size="icon" variant="ghost" onClick={() => navigate("/dashboards")} title="Back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <LayoutDashboard className="h-4 w-4 text-primary shrink-0" />
              <h1 className="page-title truncate">{dashboard.name}</h1>
              <Badge variant="outline" className="gap-1 text-[10px]">
                {dashboard.is_shared ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                {dashboard.is_shared ? "Shared" : "Private"}
              </Badge>
            </div>
            {dashboard.description && <p className="page-subtitle truncate">{dashboard.description}</p>}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" className="gap-2" onClick={() => setRefreshKey((k) => k + 1)}>
            <RefreshCw className="h-4 w-4" /> Refresh
          </Button>
          {canEdit && (
            <>
              <Button variant={editing ? "default" : "outline"} className="gap-2" onClick={() => setEditing((e) => !e)}>
                {editing ? <Check className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
                {editing ? "Done" : "Edit"}
              </Button>
              <Button className="gap-2" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Add Report
              </Button>
            </>
          )}
        </div>
      </div>

      {components.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
          <LayoutDashboard className="h-16 w-16 opacity-30" />
          <p>No components yet. Add reports from the Report Builder to this dashboard.</p>
          {canEdit && (
            <Button variant="outline" className="gap-2" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" /> Add Report
            </Button>
          )}
        </div>
      ) : (
        <div key={refreshKey} className="grid grid-cols-1 md:grid-cols-6 gap-3 md:gap-4">
          {components.map((c) => (
            <DashboardComponentCard
              key={c.id}
              component={c}
              editing={editing}
              canEdit={canEdit}
              onRemove={removeComponent}
              onMove={moveComponent}
              onConfigure={openConfigure}
            />
          ))}
        </div>
      )}

      {/* Add report dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Report Component</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-80 overflow-auto space-y-2 pr-1">
            {filteredReports.length === 0 && (
              <p className="text-sm text-muted-foreground py-6 text-center">No reports found.</p>
            )}
            {filteredReports.map((r) => (
              <div key={r.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{r.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {r.primary_object} · {CHART_TYPES.find((c) => c.key === r.chart_type)?.label || r.chart_type}
                  </p>
                </div>
                <Button size="sm" variant={usedReportIds.has(r.id!) ? "outline" : "default"} onClick={() => addComponent(r)}>
                  {usedReportIds.has(r.id!) ? "Add again" : "Add"}
                </Button>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditWidgetDialog
        component={configTarget}
        onClose={() => setConfigTarget(null)}
        onSave={saveConfigure}
      />
    </div>
  );
};

export default DashboardView;
