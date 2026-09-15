import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, CopyCheck, Trash2, Pencil, ArrowUp, ArrowDown } from "lucide-react";
import { VALIDATION_OBJECTS, getObject, type ValidationObject } from "@/lib/validation/schema";
import { renderTemplate } from "@/lib/duplicates/engine";
import RuleSimulator from "@/components/duplicates/RuleSimulator";
import DuplicateAlertsPanel from "@/components/duplicates/DuplicateAlertsPanel";

import {
  DUPLICATE_ACTIONS,
  DuplicateRule,
  MatchField,
  emptyNotification,
  newId,
} from "@/lib/duplicates/types";

const sampleRecord = (obj: ValidationObject): Record<string, any> => {
  const rec: Record<string, any> = { id: "sample" };
  obj.fields.forEach((f) => {
    rec[f.key] =
      f.key === "first_name" ? "Priya" :
      f.key === "last_name" ? "Sharma" :
      f.key === "phone" ? "+91 98765 43210" :
      f.key === "email" ? "priya@example.com" :
      f.options?.[0] || `Sample ${f.label}`;
  });
  return rec;
};


export default function DuplicateManagement() {
  const queryClient = useQueryClient();
  const [objectKey, setObjectKey] = useState(VALIDATION_OBJECTS[0].key);
  const [section, setSection] = useState("rules");
  const [editing, setEditing] = useState<DuplicateRule | null>(null);


  const { data: rules = [], isLoading } = useQuery({
    queryKey: ["duplicate-rules"],
    queryFn: async (): Promise<DuplicateRule[]> => {
      const { data, error } = await (supabase as any)
        .from("duplicate_rules")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DuplicateRule[];
    },
  });

  const list = useMemo(() => rules.filter((r) => r.object_key === objectKey), [rules, objectKey]);
  const obj = getObject(objectKey)!;

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("duplicate_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["duplicate-rules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("duplicate_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duplicate-rules"] });
      toast({ title: "Duplicate rule deleted" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <CopyCheck className="h-5 w-5 text-primary" /> Duplicate Management
          </h1>
          <p className="text-sm text-muted-foreground">
            Configure how duplicates are detected, what users are told, and what they can do about it.
          </p>
        </div>
        <Button
          onClick={() =>
            setEditing({
              id: "",
              object_key: objectKey,
              name: "",
              description: "",
              is_active: true,
              match_fields: [],
              notification: emptyNotification(),
              actions: [],
            })
          }
        >
          <Plus className="h-4 w-4 mr-1" /> New Duplicate Rule
        </Button>
      </div>

      <Tabs value={objectKey} onValueChange={setObjectKey}>
        <TabsList className="flex-wrap h-auto">
          {VALIDATION_OBJECTS.map((o) => (
            <TabsTrigger key={o.key} value={o.key}>
              {o.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Tabs value={section} onValueChange={setSection}>
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="rules">Rules</TabsTrigger>
          <TabsTrigger value="simulator">Rule Test Simulator</TabsTrigger>
          <TabsTrigger value="alerts">Duplicate Alerts &amp; Bulk Job</TabsTrigger>
        </TabsList>

        <TabsContent value="simulator" className="pt-4">
          <RuleSimulator objectKey={objectKey} />
        </TabsContent>

        <TabsContent value="alerts" className="pt-4">
          <DuplicateAlertsPanel objectKey={objectKey} />
        </TabsContent>

        <TabsContent value="rules" className="pt-4">
      <Card className="divide-y">

        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && list.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No duplicate rules for {obj.label} yet.
          </div>
        )}
        {list.map((r) => (
          <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1 min-w-0">
              <button className="font-medium hover:underline text-left" onClick={() => setEditing(r)}>
                {r.name}
              </button>
              <div className="text-xs text-muted-foreground mt-1 flex flex-wrap gap-1.5 items-center">
                {(r.match_fields || []).map((f, i) => (
                  <span key={f.id} className="flex items-center gap-1.5">
                    {i > 0 && <span className="uppercase">{f.joiner}</span>}
                    <Badge variant="secondary">
                      {i + 1}. {obj.fields.find((x) => x.key === f.field_key)?.label || f.field_key}
                    </Badge>
                  </span>
                ))}
                {(r.match_fields || []).length === 0 && <span>No match fields</span>}
                <span>·</span>
                <span>{(r.actions || []).length} action{(r.actions || []).length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={r.is_active} onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })} />
              <Button size="icon" variant="ghost" onClick={() => setEditing(r)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </div>
          </div>
        ))}
      </Card>
        </TabsContent>
      </Tabs>


      {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function RuleEditor({ rule, onClose }: { rule: DuplicateRule; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<DuplicateRule>(rule);
  useEffect(() => setDraft(rule), [rule]);

  const obj = getObject(draft.object_key)!;
  const patch = (p: Partial<DuplicateRule>) => setDraft((d) => ({ ...d, ...p }));

  const addField = () =>
    patch({
      match_fields: [
        ...draft.match_fields,
        { id: newId(), field_key: obj.fields[0].key, matchType: "exact", joiner: "and", severity: "alert" } as MatchField,
      ],
    });

  const updateField = (id: string, p: Partial<MatchField>) =>
    patch({ match_fields: draft.match_fields.map((f) => (f.id === id ? { ...f, ...p } : f)) });

  const moveField = (index: number, dir: -1 | 1) => {
    const next = [...draft.match_fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    patch({ match_fields: next });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!draft.name.trim()) throw new Error("Rule name is required");
      if (draft.match_fields.length === 0) throw new Error("Add at least one field to check");
      const payload = {
        object_key: draft.object_key,
        name: draft.name.trim(),
        description: draft.description,
        is_active: draft.is_active,
        match_fields: draft.match_fields,
        notification: draft.notification,
        actions: draft.actions,
      };
      if (draft.id) {
        const { error } = await (supabase as any).from("duplicate_rules").update(payload).eq("id", draft.id);
        if (error) throw error;
      } else {
        const { error } = await (supabase as any).from("duplicate_rules").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["duplicate-rules"] });
      toast({ title: "Duplicate rule saved" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const availableActions = DUPLICATE_ACTIONS.filter(
    (a) => !a.objects || a.objects.includes(draft.object_key),
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{draft.id ? "Edit" : "New"} Duplicate Rule</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="matching">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="matching">Matching</TabsTrigger>
            <TabsTrigger value="notification">Notification Console</TabsTrigger>
            <TabsTrigger value="actions">Action Console</TabsTrigger>
          </TabsList>

          <TabsContent value="matching" className="space-y-4 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Object</Label>
                <Select
                  value={draft.object_key}
                  onValueChange={(v) => patch({ object_key: v, match_fields: [], actions: [] })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VALIDATION_OBJECTS.map((o) => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Rule name *</Label>
                <Input value={draft.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Patient phone duplicate" />
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Input value={draft.description || ""} onChange={(e) => patch({ description: e.target.value })} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Fields to check (in priority order)</Label>
                <Button size="sm" variant="outline" onClick={addField}>
                  <Plus className="h-4 w-4 mr-1" /> Add field
                </Button>
              </div>
              {draft.match_fields.length === 0 && (
                <p className="text-sm text-muted-foreground">No fields yet — the engine checks fields top to bottom.</p>
              )}
              {draft.match_fields.map((f, i) => (
                <Card key={f.id} className="p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">Priority {i + 1}</Badge>
                    {i > 0 && (
                      <Select value={f.joiner} onValueChange={(v) => updateField(f.id, { joiner: v as any })}>
                        <SelectTrigger className="w-24 h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="and">AND</SelectItem>
                          <SelectItem value="or">OR</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    <div className="ml-auto flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => moveField(i, -1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" onClick={() => moveField(i, 1)}><ArrowDown className="h-4 w-4" /></Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => patch({ match_fields: draft.match_fields.filter((x) => x.id !== f.id) })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <Select value={f.field_key} onValueChange={(v) => updateField(f.id, { field_key: v })}>
                      <SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger>
                      <SelectContent>
                        {obj.fields.map((of) => (
                          <SelectItem key={of.key} value={of.key}>{of.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select value={f.matchType} onValueChange={(v) => updateField(f.id, { matchType: v as any })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="exact">Exact match</SelectItem>
                        <SelectItem value="case_insensitive">Exact (ignore case)</SelectItem>
                        <SelectItem value="fuzzy">Fuzzy / similar</SelectItem>
                        <SelectItem value="starts_with">Starts with</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={f.severity || "alert"}
                      onValueChange={(v) => updateField(f.id, { severity: v as any })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alert">Alert only (can still save)</SelectItem>
                        <SelectItem value="block">Block save (stop the user)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {(f.severity || "alert") === "block"
                      ? "If this field matches an existing record, the user cannot save."
                      : "If this field matches, the user is warned but may continue."}
                  </p>

                </Card>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <Switch checked={draft.is_active} onCheckedChange={(v) => patch({ is_active: v })} />
              <Label>Rule is active</Label>
            </div>
          </TabsContent>

          <TabsContent value="notification" className="space-y-3 pt-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Default severity</Label>
                <Select
                  value={draft.notification.severity}
                  onValueChange={(v) => patch({ notification: { ...draft.notification, severity: v as any } })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="alert">Alert (allow save)</SelectItem>
                    <SelectItem value="error">Error (block save)</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Individual fields set to "Block save" always stop the user, whatever this is set to.
                </p>
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={draft.notification.title}
                  onChange={(e) => patch({ notification: { ...draft.notification, title: e.target.value } })}
                  placeholder="Possible duplicate found"
                />
              </div>
            </div>
            <div>
              <Label>Message shown to the user</Label>
              <Textarea
                rows={3}
                value={draft.notification.message}
                onChange={(e) => patch({ notification: { ...draft.notification, message: e.target.value } })}
                placeholder="A record with the same phone number already exists: {{match}}"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Click a token to insert data from the duplicate record into the message.
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {[
                  { token: "{{match}}", label: "Matched record name" },
                  { token: "{{field}}", label: "Matched field(s)" },
                  ...obj.fields.map((f) => ({ token: `{{field.${f.key}}}`, label: f.label })),
                ].map((t) => (
                  <Button
                    key={t.token}
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={() =>
                      patch({
                        notification: {
                          ...draft.notification,
                          message: `${draft.notification.message || ""}${draft.notification.message ? " " : ""}${t.token}`,
                        },
                      })
                    }
                  >
                    {t.label}
                  </Button>
                ))}
              </div>
            </div>
            <Card className="p-3 bg-muted/40">
              <div className="text-xs font-medium mb-1">Preview</div>
              <div className="text-sm font-medium">{draft.notification.title || "Possible duplicate found"}</div>
              <p className="text-sm text-muted-foreground">
                {renderTemplate(draft.notification.message || "", {
                  objectKey: draft.object_key,
                  record: sampleRecord(obj),
                  matchedFields: draft.match_fields,
                })}
              </p>
            </Card>
            <div className="flex items-center gap-2">
              <Checkbox
                id="show-list"
                checked={draft.notification.showMatchList}
                onCheckedChange={(v) => patch({ notification: { ...draft.notification, showMatchList: !!v } })}
              />
              <Label htmlFor="show-list">Show the list of matching records</Label>
            </div>
          </TabsContent>



          <TabsContent value="actions" className="space-y-2 pt-4">
            <p className="text-sm text-muted-foreground">
              Choose what the user can do when a duplicate is detected.
            </p>
            {availableActions.map((a) => {
              const selected = draft.actions.find((x) => x.key === a.key);
              return (
                <Card key={a.key} className="p-3 space-y-2">
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={!!selected}
                      onCheckedChange={(v) =>
                        patch({
                          actions: v
                            ? [...draft.actions, { key: a.key, label: a.label }]
                            : draft.actions.filter((x) => x.key !== a.key),
                        })
                      }
                    />
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{a.label}</div>
                      <p className="text-xs text-muted-foreground">{a.description}</p>
                      {selected && (
                        <Input
                          className="mt-2"
                          value={selected.label}
                          onChange={(e) =>
                            patch({
                              actions: draft.actions.map((x) =>
                                x.key === a.key ? { ...x, label: e.target.value } : x,
                              ),
                            })
                          }
                          placeholder="Button label"
                        />
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save rule"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
