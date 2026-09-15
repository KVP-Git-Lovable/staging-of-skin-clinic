// Thin wrapper over the generic src/components/listViews/KanbanSettingsDialog.tsx -
// binds KANBAN_GROUP_FIELDS/KANBAN_SUMMARY_FIELDS so nothing else in the
// Patients page needs to change.
import GenericKanbanSettingsDialog from "@/components/listViews/KanbanSettingsDialog";
import { KANBAN_GROUP_FIELDS, KANBAN_SUMMARY_FIELDS, type KanbanConfig } from "@/lib/patientFields";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: KanbanConfig;
  onSave: (config: KanbanConfig) => void;
}

export default function KanbanSettingsDialog(props: Props) {
  return (
    <GenericKanbanSettingsDialog
      {...props}
      groupFields={KANBAN_GROUP_FIELDS}
      summaryFields={KANBAN_SUMMARY_FIELDS}
      defaultGroupField="status"
    />
  );
}
