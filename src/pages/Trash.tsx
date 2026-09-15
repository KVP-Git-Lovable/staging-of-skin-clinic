import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, RotateCcw, Trash2, Search } from "lucide-react";
import {
  canPurge,
  fetchTrashSettings,
  objectLabel,
  purgeAvailableOn,
  purgeTrashItem,
  restoreFromTrash,
  TRASH_OBJECT_LABELS,
  type TrashItem,
} from "@/lib/trash";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";

export default function Trash() {
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [objectFilter, setObjectFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("trashed");
  const [retention, setRetention] = useState(30);
  const [purgeTarget, setPurgeTarget] = useState<TrashItem | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trash_items" as any)
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    setItems(((data as any) ?? []) as TrashItem[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    fetchTrashSettings().then((s) => setRetention(s.retention_days));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((i) => {
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (objectFilter !== "all" && i.object_type !== objectFilter) return false;
      if (!term) return true;
      return (
        (i.record_label || "").toLowerCase().includes(term) ||
        objectLabel(i.object_type).toLowerCase().includes(term) ||
        (i.deleted_by_name || "").toLowerCase().includes(term)
      );
    });
  }, [items, search, objectFilter, statusFilter]);

  const handleRestore = async (item: TrashItem) => {
    try {
      await restoreFromTrash(item.id);
      toast.success(`${objectLabel(item.object_type)} restored`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handlePurge = async (item: TrashItem) => {
    try {
      await purgeTrashItem(item.id);
      toast.success("Permanently deleted");
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Trash</h1>
        <p className="text-sm text-muted-foreground">
          Deleted records are kept here for {retention} day{retention === 1 ? "" : "s"} before they can be permanently
          removed. Restore any record back to its original module.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Search trash…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={objectFilter} onValueChange={setObjectFilter}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Object" /></SelectTrigger>
          <SelectContent className="bg-popover z-50 max-h-72">
            <SelectItem value="all">All objects</SelectItem>
            {Object.keys(TRASH_OBJECT_LABELS).map((k) => (
              <SelectItem key={k} value={k}>{TRASH_OBJECT_LABELS[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent className="bg-popover z-50">
            <SelectItem value="trashed">In trash</SelectItem>
            <SelectItem value="restored">Restored</SelectItem>
            <SelectItem value="purged">Permanently deleted</SelectItem>
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">Nothing here.</Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const eligible = canPurge(item.deleted_at, retention);
            return (
              <Card key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-[10px]">{objectLabel(item.object_type)}</Badge>
                    <span className="font-medium truncate">{item.record_label || item.record_id.slice(0, 8)}</span>
                    {item.status !== "trashed" && (
                      <Badge variant="outline" className="text-[10px] capitalize">{item.status}</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Deleted by {item.deleted_by_name || "unknown"} on {new Date(item.deleted_at).toLocaleString()}
                    {item.status === "trashed" && !eligible && (
                      <> · can be permanently deleted after {purgeAvailableOn(item.deleted_at, retention).toLocaleDateString()}</>
                    )}
                    {item.status === "restored" && item.restored_at && (
                      <> · restored on {new Date(item.restored_at).toLocaleString()}</>
                    )}
                    {item.status === "purged" && item.purged_at && (
                      <> · purged on {new Date(item.purged_at).toLocaleString()}</>
                    )}
                  </p>
                </div>
                {item.status === "trashed" && (
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => handleRestore(item)}>
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      disabled={!eligible}
                      title={eligible ? "Delete permanently" : `Available after ${purgeAvailableOn(item.deleted_at, retention).toLocaleDateString()}`}
                      onClick={() => setPurgeTarget(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete forever
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <DeleteConfirmDialog
        open={!!purgeTarget}
        onOpenChange={(o) => { if (!o) setPurgeTarget(null); }}
        entity={purgeTarget ? `${objectLabel(purgeTarget.object_type)} "${purgeTarget.record_label || ""}"` : "record"}
        note="This is permanent and cannot be undone."
        onConfirm={async () => { if (purgeTarget) await handlePurge(purgeTarget); setPurgeTarget(null); }}
      />
    </div>
  );
}
