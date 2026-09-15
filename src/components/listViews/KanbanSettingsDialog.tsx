// Generic kanban-settings dialog, extracted from
// src/components/patients/listviews/KanbanSettingsDialog.tsx. The
// candidate group/summary fields are passed in instead of importing
// KANBAN_GROUP_FIELDS/KANBAN_SUMMARY_FIELDS.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { FieldDef, KanbanConfig } from "@/lib/listViews/engine";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: KanbanConfig;
  onSave: (config: KanbanConfig) => void;
  groupFields: FieldDef[];
  summaryFields: FieldDef[];
  /** Default group field when none is set yet. Defaults to "status". */
  defaultGroupField?: string;
}

const NONE = "__none__";

export default function KanbanSettingsDialog({
  open, onOpenChange, config, onSave, groupFields, summaryFields, defaultGroupField = "status",
}: Props) {
  const [groupField, setGroupField] = useState(config.group_field || defaultGroupField);
  const [summarize, setSummarize] = useState(config.summarize_field || NONE);

  useEffect(() => {
    if (!open) return;
    setGroupField(config.group_field || defaultGroupField);
    setSummarize(config.summarize_field || NONE);
  }, [open, config, defaultGroupField]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kanban Settings</DialogTitle>
          <DialogDescription>Choose what to summarise and how cards are grouped.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Summarize By</Label>
            <Select value={summarize} onValueChange={setSummarize}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="-- None --" />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                <SelectItem value={NONE}>-- None --</SelectItem>
                {summaryFields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <span className="text-destructive">*</span> Group By
            </Label>
            <Select value={groupField} onValueChange={setGroupField}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {groupFields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave({ group_field: groupField, summarize_field: summarize === NONE ? null : summarize });
              onOpenChange(false);
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
