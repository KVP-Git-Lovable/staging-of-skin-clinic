import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Save, Trash2 } from "lucide-react";
import {
  canPurge,
  fetchTrashSettings,
  objectLabel,
  purgeTrashItem,
  saveTrashSettings,
  type TrashItem,
} from "@/lib/trash";

export default function TrashAdmin() {
  const [retention, setRetention] = useState(30);
  const [autoPurge, setAutoPurge] = useState(false);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<TrashItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [purging, setPurging] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("trash_items" as any)
      .select("*")
      .order("deleted_at", { ascending: false })
      .limit(1000);
    if (error) toast.error(error.message);
    setItems(((data as any) ?? []) as TrashItem[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchTrashSettings().then((s) => { setRetention(s.retention_days); setAutoPurge(s.auto_purge); });
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await saveTrashSettings(retention, autoPurge);
      toast.success("Trash policy saved");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const byUser = useMemo(() => {
    const map = new Map<string, { name: string; trashed: number; restored: number; purged: number; last: string }>();
    items.forEach((i) => {
      const key = i.deleted_by_name || i.deleted_by || "unknown";
      const cur = map.get(key) ?? { name: key, trashed: 0, restored: 0, purged: 0, last: i.deleted_at };
      cur[i.status] += 1;
      if (new Date(i.deleted_at) > new Date(cur.last)) cur.last = i.deleted_at;
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.trashed + b.purged - (a.trashed + a.purged));
  }, [items]);

  const byObject = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((i) => map.set(i.object_type, (map.get(i.object_type) ?? 0) + 1));
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const eligible = items.filter((i) => i.status === "trashed" && canPurge(i.deleted_at, retention));

  const clearEligible = async () => {
    setPurging(true);
    let ok = 0;
    for (const item of eligible) {
      try { await purgeTrashItem(item.id); ok++; } catch { /* skip */ }
    }
    setPurging(false);
    toast.success(`${ok} item(s) permanently deleted`);
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl md:text-2xl font-semibold">Trash Policy &amp; Audit</h1>
        <p className="text-sm text-muted-foreground">
          Control how long deleted records are retained and review deletion activity across all users.
        </p>
      </div>

      <Tabs defaultValue="policy">
        <TabsList className="w-full sm:w-auto overflow-x-auto">
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="report">Trash Report</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        <TabsContent value="policy" className="mt-4 space-y-4">
          <Card className="p-4 space-y-4 max-w-xl">
            <div className="space-y-2">
              <Label htmlFor="retention">Minimum retention (days)</Label>
              <Input
                id="retention"
                type="number"
                min={0}
                value={retention}
                onChange={(e) => setRetention(Math.max(0, Number(e.target.value) || 0))}
              />
              <p className="text-xs text-muted-foreground">
                Items cannot be permanently deleted from Trash until this many days have passed since deletion.
              </p>
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label>Auto-clear expired items</Label>
                <p className="text-xs text-muted-foreground">Allow admins to bulk-clear items past the retention window.</p>
              </div>
              <Switch checked={autoPurge} onCheckedChange={setAutoPurge} />
            </div>
            <Button onClick={save} disabled={saving} className="gap-2">
              <Save className="h-4 w-4" /> {saving ? "Saving…" : "Save policy"}
            </Button>
          </Card>

          <Card className="p-4 max-w-xl space-y-3">
            <div className="font-medium">Clear eligible trash</div>
            <p className="text-sm text-muted-foreground">
              {eligible.length} item(s) are past the {retention}-day retention window.
            </p>
            <Button
              variant="destructive"
              className="gap-2"
              disabled={!autoPurge || eligible.length === 0 || purging}
              onClick={clearEligible}
            >
              <Trash2 className="h-4 w-4" /> {purging ? "Clearing…" : "Clear now"}
            </Button>
            {!autoPurge && <p className="text-xs text-muted-foreground">Enable auto-clear above to use this.</p>}
          </Card>
        </TabsContent>

        <TabsContent value="report" className="mt-4 space-y-4">
          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="p-4"><div className="text-xs text-muted-foreground">In trash</div><div className="text-2xl font-semibold">{items.filter(i => i.status === "trashed").length}</div></Card>
                <Card className="p-4"><div className="text-xs text-muted-foreground">Restored</div><div className="text-2xl font-semibold">{items.filter(i => i.status === "restored").length}</div></Card>
                <Card className="p-4"><div className="text-xs text-muted-foreground">Permanently deleted</div><div className="text-2xl font-semibold">{items.filter(i => i.status === "purged").length}</div></Card>
              </div>

              <Card className="p-4">
                <div className="font-medium mb-3">By user</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-muted-foreground border-b">
                        <th className="py-2 pr-4">User</th>
                        <th className="py-2 pr-4">In trash</th>
                        <th className="py-2 pr-4">Restored</th>
                        <th className="py-2 pr-4">Purged</th>
                        <th className="py-2">Last deletion</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {byUser.map((u) => (
                        <tr key={u.name}>
                          <td className="py-2 pr-4">{u.name}</td>
                          <td className="py-2 pr-4">{u.trashed}</td>
                          <td className="py-2 pr-4">{u.restored}</td>
                          <td className="py-2 pr-4">{u.purged}</td>
                          <td className="py-2">{new Date(u.last).toLocaleString()}</td>
                        </tr>
                      ))}
                      {byUser.length === 0 && <tr><td className="py-3 text-muted-foreground" colSpan={5}>No deletions recorded.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </Card>

              <Card className="p-4">
                <div className="font-medium mb-3">By object</div>
                <div className="flex flex-wrap gap-2">
                  {byObject.map(([obj, count]) => (
                    <Badge key={obj} variant="secondary">{objectLabel(obj)} · {count}</Badge>
                  ))}
                  {byObject.length === 0 && <span className="text-sm text-muted-foreground">No deletions recorded.</span>}
                </div>
              </Card>
            </>
          )}
        </TabsContent>

        <TabsContent value="activity" className="mt-4">
          <Card className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b bg-muted/40">
                  <th className="p-3">Object</th>
                  <th className="p-3">Record</th>
                  <th className="p-3">Deleted by</th>
                  <th className="p-3">Deleted at</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((i) => (
                  <tr key={i.id}>
                    <td className="p-3">{objectLabel(i.object_type)}</td>
                    <td className="p-3">{i.record_label || i.record_id.slice(0, 8)}</td>
                    <td className="p-3">{i.deleted_by_name || "—"}</td>
                    <td className="p-3">{new Date(i.deleted_at).toLocaleString()}</td>
                    <td className="p-3 capitalize">{i.status}</td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td className="p-4 text-muted-foreground" colSpan={5}>No activity.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
