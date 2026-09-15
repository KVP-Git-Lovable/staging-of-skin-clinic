import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { VALIDATION_OBJECTS, getObject } from "@/lib/validation/schema";
import { useAllValidationRules } from "@/hooks/useValidationRules";
import { ANY_VALUE, newId } from "@/lib/validation/engine";

export default function ValidationRules() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: rules = [], isLoading } = useAllValidationRules();
  const [objectKey, setObjectKey] = useState(VALIDATION_OBJECTS[0].key);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [fieldKey, setFieldKey] = useState("");

  const obj = getObject(objectKey)!;
  const list = useMemo(() => rules.filter((r) => r.object_key === objectKey), [rules, objectKey]);

  const create = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Rule name is required");
      if (!fieldKey) throw new Error("Select a field to validate");
      const { data, error } = await (supabase as any)
        .from("validation_rules")
        .insert({
          object_key: objectKey,
          field_key: fieldKey,
          name: name.trim(),
          execute_when: "criteria_met",
          validate_on: "save_only",
          config: {
            branches: [
              {
                id: newId(),
                optionValue: ANY_VALUE,
                cases: [
                  {
                    id: newId(),
                    criteria: [],
                    pattern: "",
                    preference: "error",
                    message: "",
                    errorLocation: "primary",
                  },
                ],
              },
            ],
          },
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      queryClient.invalidateQueries({ queryKey: ["validation-rules"] });
      setCreateOpen(false);
      setName("");
      setFieldKey("");
      navigate(`/validation-rules/${id}`);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await (supabase as any).from("validation_rules").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["validation-rules"] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("validation_rules").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["validation-rules"] });
      toast({ title: "Validation rule deleted" });
    },
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Validation Rules
          </h1>
          <p className="text-sm text-muted-foreground">
            Enforce data quality across objects. Rules run when records are saved.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> New Validation Rule
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

      <Card className="divide-y">
        {isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
        {!isLoading && list.length === 0 && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No validation rules for {obj.label} yet.
          </div>
        )}
        {list.map((r) => {
          const field = obj.fields.find((f) => f.key === r.field_key);
          const branchCount = r.config?.branches?.length || 0;
          return (
            <div key={r.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <button
                  className="font-medium hover:underline text-left"
                  onClick={() => navigate(`/validation-rules/${r.id}`)}
                >
                  {r.name}
                </button>
                <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-2 items-center">
                  <Badge variant="secondary">{field?.label || r.field_key}</Badge>
                  <span>{branchCount} condition{branchCount === 1 ? "" : "s"}</span>
                  <span>·</span>
                  <span>{r.validate_on === "save_only" ? "Save Only" : "Save & Edit"}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={r.is_active}
                  onCheckedChange={(v) => toggleActive.mutate({ id: r.id, is_active: v })}
                />
                <Button size="icon" variant="ghost" onClick={() => navigate(`/validation-rules/${r.id}`)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(r.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New Validation Rule</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Object</Label>
              <Select value={objectKey} onValueChange={(v) => { setObjectKey(v); setFieldKey(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VALIDATION_OBJECTS.map((o) => (
                    <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Field to validate *</Label>
              <Select value={fieldKey} onValueChange={setFieldKey}>
                <SelectTrigger><SelectValue placeholder="Select field" /></SelectTrigger>
                <SelectContent>
                  {obj.fields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Rule name *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Discount threshold" />
            </div>
            <Button className="w-full" onClick={() => create.mutate()} disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create & Configure"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}