import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { LayoutDashboard, Plus, Users, Lock, Pencil, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

interface DashboardRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  is_shared: boolean;
  updated_at: string;
  component_count?: number;
}

const Dashboards = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DashboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DashboardRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isShared, setIsShared] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("dashboards" as any)
      .select("*, dashboard_components(id)")
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("Failed to load dashboards");
    } else {
      setRows(
        ((data as any[]) || []).map((d: any) => ({
          ...d,
          component_count: (d.dashboard_components || []).length,
        }))
      );
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setIsShared(true);
    setDialogOpen(true);
  };

  const openEdit = (row: DashboardRow) => {
    setEditing(row);
    setName(row.name);
    setDescription(row.description || "");
    setIsShared(row.is_shared);
    setDialogOpen(true);
  };

  const save = async () => {
    if (!name.trim()) {
      toast.error("Dashboard name is required");
      return;
    }
    if (!user?.id) {
      toast.error("Sign in to create dashboards");
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from("dashboards" as any)
        .update({ name: name.trim(), description: description.trim() || null, is_shared: isShared } as any)
        .eq("id", editing.id);
      if (error) return toast.error("Failed to update dashboard");
      toast.success("Dashboard updated");
      setDialogOpen(false);
      fetchData();
      return;
    }
    const { data, error } = await supabase
      .from("dashboards" as any)
      .insert({
        name: name.trim(),
        description: description.trim() || null,
        is_shared: isShared,
        owner_id: user.id,
      } as any)
      .select("id")
      .single();
    if (error) return toast.error("Failed to create dashboard");
    toast.success("Dashboard created");
    setDialogOpen(false);
    navigate(`/dashboards/${(data as any).id}`);
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("dashboards" as any).delete().eq("id", id);
    if (error) return toast.error("Failed to delete dashboard");
    toast.success("Dashboard deleted");
    fetchData();
  };

  return (
    <div>
      <div className="page-header flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="page-title">Dashboards</h1>
          <p className="page-subtitle">Group multiple reports into one live view</p>
        </div>
        <Button onClick={openNew} className="gap-2">
          <Plus className="h-4 w-4" /> New Dashboard
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48 text-muted-foreground">Loading...</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-4 text-muted-foreground">
          <LayoutDashboard className="h-16 w-16 opacity-30" />
          <p>No dashboards yet. Create one and add reports to it.</p>
          <Button onClick={openNew} variant="outline" className="gap-2">
            <Plus className="h-4 w-4" /> Create Dashboard
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
          {rows.map((row) => {
            const isOwner = row.owner_id === user?.id;
            return (
              <div key={row.id} className="data-table p-4 flex flex-col gap-2">
                <button className="text-left" onClick={() => navigate(`/dashboards/${row.id}`)}>
                  <div className="flex items-center gap-2">
                    <LayoutDashboard className="h-4 w-4 text-primary shrink-0" />
                    <h3 className="font-display font-semibold truncate">{row.name}</h3>
                  </div>
                  {row.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{row.description}</p>
                  )}
                </button>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-[10px]">
                    {row.component_count || 0} report{row.component_count === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] gap-1">
                    {row.is_shared ? <Users className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                    {row.is_shared ? "Shared" : "Private"}
                  </Badge>
                  <span className="text-[10px] text-muted-foreground">
                    Updated {formatDistanceToNow(new Date(row.updated_at), { addSuffix: true })}
                  </span>
                </div>
                {isOwner && (
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => openEdit(row)}>
                      <Pencil className="h-3 w-3" /> Edit
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-1 text-xs text-destructive">
                          <Trash2 className="h-3 w-3" /> Delete
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete dashboard?</AlertDialogTitle>
                          <AlertDialogDescription>
                            "{row.name}" and its report components will be removed. The saved reports themselves are
                            not affected.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => remove(row.id)}
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Dashboard" : "New Dashboard"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Clinic Performance" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this dashboard tracks"
                rows={3}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Share with everyone</p>
                <p className="text-xs text-muted-foreground">All signed-in users can view this dashboard</p>
              </div>
              <Switch checked={isShared} onCheckedChange={setIsShared} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Dashboards;
