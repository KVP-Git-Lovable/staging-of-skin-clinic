import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { moveToTrash } from "@/lib/trash";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, FileBarChart, FolderPlus, Folder } from "lucide-react";
import { toast } from "sonner";
import { ReportList } from "@/components/reports/ReportList";
import { ReportBuilder } from "@/components/reports/ReportBuilder";
import { ReportViewer } from "@/components/reports/ReportViewer";
import type { SavedReport } from "@/lib/reportObjects";
import { useAuth } from "@/hooks/useAuth";

interface ReportFolder {
  id: string;
  name: string;
  description?: string;
}

const ReportConfigurator = () => {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [folders, setFolders] = useState<ReportFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeReport, setActiveReport] = useState<SavedReport | null>(null);
  const [mode, setMode] = useState<"list" | "edit" | "view">("list");
  const [activeFolder, setActiveFolder] = useState<string>("all");
  const [newFolderName, setNewFolderName] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());

  const fetchData = async () => {
    setLoading(true);
    const [reportsRes, foldersRes] = await Promise.all([
      supabase.from("saved_reports").select("*").order("updated_at", { ascending: false }),
      supabase.from("report_folders" as any).select("*").order("name"),
    ]);
    if (!reportsRes.error) {
      setReports(
        (reportsRes.data || []).map((r: any) => ({
          ...r,
          columns: r.columns || [],
          group_rows: r.group_rows || [],
          group_columns: r.group_columns || [],
          filters: r.filters || [],
          display_options: r.display_options || undefined,
        }))
      );
    }
    if (!foldersRes.error) {
      setFolders((foldersRes.data as any) || []);
    }
    setLoading(false);
  };

  const fetchPins = async () => {
    if (!user?.id) {
      setPinnedIds(new Set());
      return;
    }
    const { data, error } = await supabase
      .from("dashboard_pins")
      .select("report_id")
      .eq("user_id", user.id);
    if (!error) {
      setPinnedIds(new Set((data || []).map((d: any) => d.report_id as string)));
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchPins();
  }, [user?.id]);

  // Auto-open a report when navigated with ?view=<id>
  useEffect(() => {
    const viewId = searchParams.get("view");
    if (!viewId || reports.length === 0) return;
    const target = reports.find((r) => r.id === viewId);
    if (target) {
      setActiveReport(target);
      setMode("view");
      // Clean the query so refresh doesn't re-trigger
      searchParams.delete("view");
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, reports, setSearchParams]);

  const handleNew = () => {
    setActiveReport(null);
    setMode("edit");
  };

  const handleEdit = (report: SavedReport) => {
    setActiveReport(report);
    setMode("edit");
  };

  const handleView = (report: SavedReport) => {
    setActiveReport(report);
    setMode("view");
  };

  const handleDelete = async (id: string) => {
    const error: any = await moveToTrash("saved_reports", id).then(() => null).catch((e: any) => e);
    if (error) {
      toast.error("Failed to delete report");
    } else {
      toast.success("Report deleted");
      fetchData();
      fetchPins();
    }
  };

  const handleTogglePin = async (report: SavedReport) => {
    if (!user?.id || !report.id) {
      toast.error("Sign in to pin reports");
      return;
    }
    const isPinned = pinnedIds.has(report.id);
    if (isPinned) {
      const { error } = await supabase
        .from("dashboard_pins")
        .delete()
        .eq("user_id", user.id)
        .eq("report_id", report.id);
      if (error) {
        toast.error("Failed to unpin");
        return;
      }
      toast.success("Unpinned from Dashboard");
    } else {
      const { error } = await supabase
        .from("dashboard_pins")
        .insert({ user_id: user.id, report_id: report.id, position: pinnedIds.size });
      if (error) {
        toast.error("Failed to pin");
        return;
      }
      toast.success("Pinned to Dashboard");
    }
    fetchPins();
  };

  const handleSave = async (report: SavedReport) => {
    const saved = await saveReport(report);
    if (saved) {
      setMode("list");
      fetchData();
    }
  };

  const handleSaveAndRun = async (report: SavedReport) => {
    const saved = await saveReport(report);
    if (saved) {
      // Refetch to get the saved report with ID
      const { data } = await supabase
        .from("saved_reports")
        .select("*")
        .eq("name", report.name)
        .order("updated_at", { ascending: false })
        .limit(1);
      if (data && data.length > 0) {
        const r = data[0] as any;
        setActiveReport({
          ...r,
          columns: r.columns || [],
          group_rows: r.group_rows || [],
          group_columns: r.group_columns || [],
          filters: r.filters || [],
          display_options: r.display_options || undefined,
        });
        setMode("view");
      } else {
        setMode("list");
      }
      fetchData();
    }
  };

  const saveReport = async (report: SavedReport): Promise<boolean> => {
    const payload = {
      name: report.name,
      description: report.description || null,
      primary_object: report.primary_object,
      related_object: report.related_object || null,
      columns: report.columns as any,
      group_rows: report.group_rows as any,
      group_columns: report.group_columns as any,
      filters: report.filters as any,
      chart_type: report.chart_type,
      folder_id: report.folder_id || null,
      display_options: (report.display_options || null) as any,
    };

    if (report.id) {
      const { error } = await supabase
        .from("saved_reports")
        .update(payload)
        .eq("id", report.id);
      if (error) {
        toast.error("Failed to update report");
        return false;
      }
      toast.success("Report updated");
    } else {
      const { error } = await supabase.from("saved_reports").insert(payload);
      if (error) {
        toast.error("Failed to save report");
        return false;
      }
      toast.success("Report saved");
    }
    return true;
  };

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;
    const { error } = await supabase.from("report_folders" as any).insert({ name: newFolderName.trim() } as any);
    if (error) {
      toast.error("Failed to create folder");
    } else {
      toast.success("Folder created");
      setNewFolderName("");
      setFolderDialogOpen(false);
      fetchData();
    }
  };

  if (mode === "edit") {
    return (
      <ReportBuilder
        initial={activeReport}
        onSave={handleSave}
        onSaveAndRun={handleSaveAndRun}
        onClose={() => setMode("list")}
        folders={folders}
      />
    );
  }

  if (mode === "view" && activeReport) {
    return (
      <ReportViewer
        report={activeReport}
        onEdit={() => setMode("edit")}
        onClose={() => setMode("list")}
      />
    );
  }

  const filteredReports = activeFolder === "all"
    ? reports
    : activeFolder === "unfiled"
      ? reports.filter((r) => !r.folder_id)
      : reports.filter((r) => r.folder_id === activeFolder);

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Report Configurator</h1>
          <p className="page-subtitle">Build, save and manage custom reports</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <FolderPlus className="h-4 w-4" /> New Folder
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-sm">
              <DialogHeader>
                <DialogTitle>Create Folder</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input
                  placeholder="Folder name"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                />
                <Button onClick={handleCreateFolder} className="w-full">Create</Button>
              </div>
            </DialogContent>
          </Dialog>
          <Button onClick={handleNew} className="gap-2">
            <Plus className="h-4 w-4" /> New Report
          </Button>
        </div>
      </div>

      {/* Folder tabs */}
      {folders.length > 0 && (
        <div className="flex gap-2 mb-4 flex-wrap">
          <Button
            size="sm"
            variant={activeFolder === "all" ? "default" : "outline"}
            onClick={() => setActiveFolder("all")}
            className="gap-1 text-xs"
          >
            All ({reports.length})
          </Button>
          {folders.map((f) => {
            const count = reports.filter((r) => r.folder_id === f.id).length;
            return (
              <Button
                key={f.id}
                size="sm"
                variant={activeFolder === f.id ? "default" : "outline"}
                onClick={() => setActiveFolder(f.id)}
                className="gap-1 text-xs"
              >
                <Folder className="h-3 w-3" /> {f.name} ({count})
              </Button>
            );
          })}
          <Button
            size="sm"
            variant={activeFolder === "unfiled" ? "default" : "outline"}
            onClick={() => setActiveFolder("unfiled")}
            className="gap-1 text-xs"
          >
            Unfiled ({reports.filter((r) => !r.folder_id).length})
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
      ) : filteredReports.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
          <FileBarChart className="h-16 w-16 opacity-30" />
          <p>No reports yet. Create your first report.</p>
          <Button onClick={handleNew} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" /> Create Report
          </Button>
        </div>
      ) : (
        <ReportList
          reports={filteredReports}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onRun={handleView}
          folders={folders}
          pinnedIds={pinnedIds}
          onTogglePin={handleTogglePin}
        />
      )}
    </div>
  );
};

export default ReportConfigurator;
