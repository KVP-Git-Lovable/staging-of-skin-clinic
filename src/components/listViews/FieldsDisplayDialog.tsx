// Generic "Select Fields to Display" dialog, extracted from
// src/components/patients/listviews/FieldsDisplayDialog.tsx. Field config
// and the default column set are passed in instead of importing
// PATIENT_FIELDS/DEFAULT_VIEW_COLUMNS.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FieldPicker } from "./ViewEditorDialog";
import type { FieldDef } from "@/lib/listViews/engine";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viewName: string;
  columns: string[];
  onSave: (columns: string[]) => void;
  fields: FieldDef[];
  defaultColumns: string[];
}

export default function FieldsDisplayDialog({ open, onOpenChange, viewName, columns, onSave, fields, defaultColumns }: Props) {
  const [cols, setCols] = useState<string[]>(columns);

  useEffect(() => {
    if (open) setCols(columns.length ? columns : defaultColumns);
  }, [open, columns, defaultColumns]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Select Fields to Display</DialogTitle>
          <DialogDescription>
            Choose the columns shown in "{viewName}". Filters for this standard view are locked.
          </DialogDescription>
        </DialogHeader>
        <FieldPicker fields={fields} columns={cols} onChange={setCols} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => {
              onSave(cols.length ? cols : defaultColumns);
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
