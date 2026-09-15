import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, Info } from "lucide-react";
import { getObject, operatorsFor, NO_VALUE_OPERATORS } from "@/lib/validation/schema";
import {
  ANY_VALUE,
  Criterion,
  RuleBranch,
  RuleCase,
  RuleConfig,
  ValidationRule,
  defaultPattern,
  newId,
} from "@/lib/validation/engine";

function emptyCase(): RuleCase {
  return { id: newId(), criteria: [], pattern: "", preference: "error", message: "", errorLocation: "primary" };
}

export default function ValidationRuleBuilder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: rule, isLoading } = useQuery({
    queryKey: ["validation-rule", id],
    enabled: !!id,
    queryFn: async (): Promise<ValidationRule> => {
      const { data, error } = await (supabase as any).from("validation_rules").select("*").eq("id", id).single();
      if (error) throw error;
      return data as ValidationRule;
    },
  });

  const [name, setName] = useState("");
  const [executeWhen, setExecuteWhen] = useState("criteria_met");
  const [validateOn, setValidateOn] = useState("save_only");
  const [config, setConfig] = useState<RuleConfig>({ branches: [] });

  useEffect(() => {
    if (!rule) return;
    setName(rule.name);
    setExecuteWhen(rule.execute_when);
    setValidateOn(rule.validate_on);
    setConfig(rule.config || { branches: [] });
  }, [rule]);

  const obj = rule ? getObject(rule.object_key) : null;
  const primaryField = useMemo(
    () => obj?.fields.find((f) => f.key === rule?.field_key) || null,
    [obj, rule],
  );

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await (supabase as any)
        .from("validation_rules")
        .update({ name: name.trim(), execute_when: executeWhen, validate_on: validateOn, config })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["validation-rules"] });
      queryClient.invalidateQueries({ queryKey: ["validation-rule", id] });
      toast({ title: "Validation rule saved" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const update = (fn: (draft: RuleConfig) => void) => {
    setConfig((prev) => {
      const draft: RuleConfig = JSON.parse(JSON.stringify(prev));
      fn(draft);
      return draft;
    });
  };

  if (isLoading || !rule || !obj) {
    return <div className="p-6 text-sm text-muted-foreground">Loading rule…</div>;
  }

  return (
    <div className="min-h-full bg-muted/30">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3 flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate("/validation-rules")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm text-muted-foreground">Validation Rule for</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 w-48 font-medium" />
          <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground whitespace-nowrap">
            {obj.label} / {primaryField?.label}
          </span>
        </div>
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          <Label className="text-xs text-muted-foreground">Execute rule</Label>
          <Select value={executeWhen} onValueChange={setExecuteWhen}>
            <SelectTrigger className="h-8 w-[190px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="criteria_met">When criteria is met</SelectItem>
              <SelectItem value="always">Always</SelectItem>
            </SelectContent>
          </Select>
          <Label className="text-xs text-muted-foreground">Validate On</Label>
          <Select value={validateOn} onValueChange={setValidateOn}>
            <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="save_only">Save Only</SelectItem>
              <SelectItem value="save_and_edit">Save & Edit</SelectItem>
            </SelectContent>
          </Select>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>

      {/* Canvas */}
      <div className="p-4 md:p-8 overflow-x-auto">
        <div className="min-w-[900px] relative">
          {/* WHEN node */}
          <div className="flex flex-col items-start gap-0">
            <div className="h-14 w-14 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-[11px] font-semibold tracking-wide ml-6">
              WHEN
            </div>
            <div className="ml-[3.25rem] h-6 w-px bg-border" />
            <Card className="px-4 py-2 text-sm w-64 ml-0">{primaryField?.label}</Card>
            <div className="ml-[3.25rem] h-6 w-px bg-border" />
            <Card className="px-4 py-2 text-sm w-64">Validate using criteria</Card>
            <div className="ml-[3.25rem] h-6 w-px bg-border" />
          </div>

          {/* Branches */}
          <div className="space-y-8 border-l border-border ml-[3.25rem] pl-0">
            {config.branches.map((branch, bi) => (
              <BranchRow
                key={branch.id}
                branch={branch}
                objectKey={rule.object_key}
                primaryOptions={primaryField?.options}
                onChangeOption={(v) => update((d) => { d.branches[bi].optionValue = v; })}
                onRemove={() => update((d) => { d.branches.splice(bi, 1); })}
                onAddCase={() => update((d) => { d.branches[bi].cases.push(emptyCase()); })}
                onChangeCase={(ci, fn) => update((d) => { fn(d.branches[bi].cases[ci]); })}
                onRemoveCase={(ci) => update((d) => { d.branches[bi].cases.splice(ci, 1); })}
              />
            ))}

            <div className="pl-6">
              <button
                className="text-xs border border-dashed rounded px-3 py-1.5 text-muted-foreground hover:text-foreground hover:border-primary"
                onClick={() =>
                  update((d) => {
                    d.branches.push({ id: newId(), optionValue: ANY_VALUE, cases: [emptyCase()] });
                  })
                }
              >
                Add another option
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BranchRow({
  branch,
  objectKey,
  primaryOptions,
  onChangeOption,
  onRemove,
  onAddCase,
  onChangeCase,
  onRemoveCase,
}: {
  branch: RuleBranch;
  objectKey: string;
  primaryOptions?: string[];
  onChangeOption: (v: string) => void;
  onRemove: () => void;
  onAddCase: () => void;
  onChangeCase: (ci: number, fn: (c: RuleCase) => void) => void;
  onRemoveCase: (ci: number) => void;
}) {
  return (
    <div className="relative pl-6">
      <div className="absolute left-0 top-8 w-6 h-px bg-border" />
      <div className="flex flex-col lg:flex-row gap-6 items-start">
        {/* Option node */}
        <Card className="w-56 shrink-0 p-3">
          <Label className="text-[10px] uppercase text-muted-foreground">Field value</Label>
          {primaryOptions?.length ? (
            <Select value={branch.optionValue} onValueChange={onChangeOption}>
              <SelectTrigger className="h-8 mt-1 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY_VALUE}>Any value</SelectItem>
                {primaryOptions.map((o) => (
                  <SelectItem key={o} value={o}>{o}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              className="h-8 mt-1 text-xs"
              value={branch.optionValue === ANY_VALUE ? "" : branch.optionValue}
              placeholder="Any value"
              onChange={(e) => onChangeOption(e.target.value || ANY_VALUE)}
            />
          )}
          <Button variant="ghost" size="sm" className="mt-2 w-full text-xs text-destructive" onClick={onRemove}>
            <Trash2 className="h-3 w-3 mr-1" /> Remove option
          </Button>
        </Card>

        {/* Cases */}
        <div className="flex-1 space-y-4 w-full">
          {branch.cases.map((rc, ci) => (
            <div key={rc.id} className="flex flex-col xl:flex-row gap-4">
              <CriteriaCard
                rc={rc}
                objectKey={objectKey}
                onChange={(fn) => onChangeCase(ci, fn)}
              />
              <PreferenceCard rc={rc} onChange={(fn) => onChangeCase(ci, fn)} onRemove={() => onRemoveCase(ci)} />
            </div>
          ))}
          <button
            className="h-6 w-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center"
            onClick={onAddCase}
            aria-label="Add rule"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CriteriaCard({
  rc,
  objectKey,
  onChange,
}: {
  rc: RuleCase;
  objectKey: string;
  onChange: (fn: (c: RuleCase) => void) => void;
}) {
  const obj = getObject(objectKey)!;

  const addCriterion = () =>
    onChange((c) => {
      c.criteria.push({ id: newId(), field: obj.fields[0].key, operator: operatorsFor(obj.fields[0].type)[0].value, value: "" });
      c.pattern = defaultPattern(c.criteria.length);
    });

  return (
    <Card className="flex-1 p-3 space-y-2">
      <div className="text-xs font-medium">Rule applied for,</div>
      {rc.criteria.length === 0 && (
        <p className="text-xs text-muted-foreground">No criteria yet — add one below.</p>
      )}
      {rc.criteria.map((cr, i) => {
        const field = obj.fields.find((f) => f.key === cr.field) || obj.fields[0];
        const ops = operatorsFor(field.type);
        const noValue = NO_VALUE_OPERATORS.includes(cr.operator);
        return (
          <div key={cr.id} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="w-4 text-muted-foreground">{i + 1}</span>
            <Select
              value={cr.field}
              onValueChange={(v) =>
                onChange((c) => {
                  const f = obj.fields.find((x) => x.key === v)!;
                  c.criteria[i].field = v;
                  c.criteria[i].operator = operatorsFor(f.type)[0].value;
                  c.criteria[i].value = "";
                })
              }
            >
              <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {obj.fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={cr.operator} onValueChange={(v) => onChange((c) => { c.criteria[i].operator = v; })}>
              <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ops.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!noValue &&
              (field.type === "picklist" && field.options?.length && ["is", "isnt"].includes(cr.operator) ? (
                <Select value={cr.value} onValueChange={(v) => onChange((c) => { c.criteria[i].value = v; })}>
                  <SelectTrigger className="h-8 w-[140px] text-xs"><SelectValue placeholder="Value" /></SelectTrigger>
                  <SelectContent>
                    {field.options.map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  className="h-8 w-[140px] text-xs"
                  type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                  value={cr.value}
                  placeholder="Value"
                  onChange={(e) => onChange((c) => { c.criteria[i].value = e.target.value; })}
                />
              ))}
            {cr.operator === "between" && (
              <Input
                className="h-8 w-[140px] text-xs"
                type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
                value={cr.value2 || ""}
                placeholder="To"
                onChange={(e) => onChange((c) => { c.criteria[i].value2 = e.target.value; })}
              />
            )}
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={() =>
                onChange((c) => {
                  c.criteria.splice(i, 1);
                  c.pattern = defaultPattern(c.criteria.length);
                })
              }
            >
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        );
      })}
      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={addCriterion}>
        <Plus className="h-3 w-3 mr-1" /> Add criteria
      </Button>
      <div className="pt-2 border-t">
        <Label className="text-[11px] font-medium">Criteria Pattern</Label>
        <Input
          className="h-8 mt-1 text-xs"
          value={rc.pattern}
          placeholder={defaultPattern(rc.criteria.length) || "1 and 2"}
          onChange={(e) => onChange((c) => { c.pattern = e.target.value; })}
        />
        <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
          <Info className="h-3 w-3" /> Use numbers with and / or, e.g. (1 and 2) or 3
        </p>
      </div>
    </Card>
  );
}

function PreferenceCard({
  rc,
  onChange,
  onRemove,
}: {
  rc: RuleCase;
  onChange: (fn: (c: RuleCase) => void) => void;
  onRemove: () => void;
}) {
  return (
    <Card className="w-full xl:w-[320px] shrink-0 p-3 space-y-3">
      <div>
        <Label className="text-[11px] font-medium">Validation Preference</Label>
        <RadioGroup
          className="flex gap-4 mt-1"
          value={rc.preference}
          onValueChange={(v) => onChange((c) => { c.preference = v as "error" | "alert"; })}
        >
          <label className="flex items-center gap-2 text-xs">
            <RadioGroupItem value="error" /> Stop with error
          </label>
          <label className="flex items-center gap-2 text-xs">
            <RadioGroupItem value="alert" /> Allow by alert
          </label>
        </RadioGroup>
      </div>
      <div>
        <Label className="text-[11px] font-medium">
          {rc.preference === "error" ? "Error Message" : "Alert Message"}
        </Label>
        <Textarea
          className="mt-1 text-xs"
          rows={3}
          maxLength={100}
          value={rc.message}
          onChange={(e) => onChange((c) => { c.message = e.target.value; })}
          placeholder="Message shown to the user"
        />
        <div className="text-[10px] text-muted-foreground text-right">{rc.message.length}/100</div>
      </div>
      {rc.preference === "error" && (
        <div>
          <Label className="text-[11px] font-medium">Error Location</Label>
          <RadioGroup
            className="flex gap-4 mt-1"
            value={rc.errorLocation}
            onValueChange={(v) => onChange((c) => { c.errorLocation = v as "primary" | "top"; })}
          >
            <label className="flex items-center gap-2 text-xs">
              <RadioGroupItem value="primary" /> On primary field
            </label>
            <label className="flex items-center gap-2 text-xs">
              <RadioGroupItem value="top" /> Top of page
            </label>
          </RadioGroup>
        </div>
      )}
      <Button variant="ghost" size="sm" className="text-xs text-destructive w-full" onClick={onRemove}>
        <Trash2 className="h-3 w-3 mr-1" /> Remove rule
      </Button>
    </Card>
  );
}