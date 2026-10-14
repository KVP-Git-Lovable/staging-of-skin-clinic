import { Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DECISION_LABELS,
  type DecisionCondition,
  type DelayUnit,
  type JourneyNode,
  type JourneyNodeData,
} from "@/lib/comms/journeyGraph";
import { VARIABLE_GROUPS } from "@/lib/comms/templateVariables";

export interface ApprovedTemplate {
  id: string;
  name: string;
  category: string;
  body: string;
  variable_map: Record<string, string> | null;
}

const allTokens = VARIABLE_GROUPS.flatMap((g) => g.variables);

export function NodePropertyPanel({
  node,
  templates,
  readOnly,
  onChange,
  onDelete,
}: {
  node: JourneyNode;
  templates: ApprovedTemplate[];
  readOnly: boolean;
  onChange: (data: Partial<JourneyNodeData>) => void;
  onDelete: () => void;
}) {
  const d = node.data;
  const placeholders = d.template_body ? Array.from(new Set(Array.from(d.template_body.matchAll(/\{\{(\d+)\}\}/g)).map((m) => m[1]))) : [];

  const pickTemplate = (id: string) => {
    const t = templates.find((x) => x.id === id);
    if (!t) return;
    onChange({
      template_id: t.id,
      template_name: t.name,
      template_category: t.category,
      template_body: t.body,
      variables: { ...(t.variable_map ?? {}) },
    });
  };

  return (
    <Card className="w-full lg:w-80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base capitalize">{node.type} step</CardTitle>
        {node.type !== "entry" && !readOnly && (
          <Button variant="ghost" size="icon" className="text-destructive" title="Delete step" onClick={onDelete}>
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {node.type === "entry" ? (
          <p className="text-sm text-muted-foreground">
            The audience comes from the journey's saved patient views. Use Edit on the journey to change it.
          </p>
        ) : (
          node.type !== "exit" && (
            <div>
              <Label>Step name</Label>
              <Input className="mt-1.5" disabled={readOnly} value={d.label ?? ""} onChange={(e) => onChange({ label: e.target.value })} />
            </div>
          )
        )}

        {node.type === "message" && (
          <>
            <div>
              <Label>WhatsApp template</Label>
              <Select value={d.template_id ?? ""} onValueChange={pickTemplate} disabled={readOnly}>
                <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose an approved template" /></SelectTrigger>
                <SelectContent>
                  {templates.length === 0 && <div className="p-2 text-sm text-muted-foreground">No approved templates yet</div>}
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">Only templates approved by WhatsApp can be used.</p>
            </div>

            {d.template_id && (
              <div className="space-y-3">
                <div className="rounded-md bg-muted/60 p-2 text-xs">
                  <Badge variant="outline" className="mb-1 capitalize">{(d.template_category ?? "").toLowerCase()}</Badge>
                  <p className="whitespace-pre-wrap">{d.template_body}</p>
                </div>
                {placeholders.map((n) => (
                  <div key={n}>
                    <Label className="text-xs">Variable {`{{${n}}}`} is filled with</Label>
                    <Select
                      value={d.variables?.[n] ?? ""}
                      disabled={readOnly}
                      onValueChange={(v) => onChange({ variables: { ...(d.variables ?? {}), [n]: v } })}
                    >
                      <SelectTrigger className="mt-1"><SelectValue placeholder="Choose patient detail" /></SelectTrigger>
                      <SelectContent>
                        {allTokens.map((t) => (
                          <SelectItem key={t.name} value={t.name}>{t.label} ({t.name})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!d.variables?.[n] && <p className="mt-1 text-xs text-destructive">Required — a blank would be sent otherwise.</p>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {node.type === "delay" && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Wait for</Label>
              <Input className="mt-1.5" type="number" min={1} disabled={readOnly} value={d.duration ?? ""} onChange={(e) => onChange({ duration: e.target.value ? Number(e.target.value) : undefined })} />
            </div>
            <div>
              <Label>Unit</Label>
              <Select value={d.unit ?? "hours"} onValueChange={(v) => onChange({ unit: v as DelayUnit })} disabled={readOnly}>
                <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {node.type === "decision" && (
          <div>
            <Label>Check whether the previous message was</Label>
            <Select value={d.condition ?? ""} onValueChange={(v) => onChange({ condition: v as DecisionCondition })} disabled={readOnly}>
              <SelectTrigger className="mt-1.5"><SelectValue placeholder="Choose a condition" /></SelectTrigger>
              <SelectContent>
                {(Object.keys(DECISION_LABELS) as DecisionCondition[]).map((c) => (
                  <SelectItem key={c} value={c}>{DECISION_LABELS[c]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-muted-foreground">
              Put a Wait step before this so delivery and read receipts have time to arrive. Connect the Yes and No outputs to the next steps.
            </p>
          </div>
        )}

        {node.type === "exit" && <p className="text-sm text-muted-foreground">Patients reaching this step finish the journey.</p>}
      </CardContent>
    </Card>
  );
}
