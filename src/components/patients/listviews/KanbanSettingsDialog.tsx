// Thin wrapper over the generic src/components/listViews/KanbanSettingsDialog.tsx -
// binds KANBAN_GROUP_FIELDS/KANBAN_SUMMARY_FIELDS so nothing else in the
// Patients page needs to change.
//
// A role that may not see billing amounts is not offered the money fields
// (lifetime value, category) to group or summarise by.
import GenericKanbanSettingsDialog from "@/components/listViews/KanbanSettingsDialog";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import { KANBAN_GROUP_FIELDS, KANBAN_SUMMARY_FIELDS, patientFieldsFor, type KanbanConfig } from "@/lib/patientFields";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: KanbanConfig;
  onSave: (config: KanbanConfig) => void;
}

export default function KanbanSettingsDialog(props: Props) {
  const canSeeBilling = useCanSeeBillingAmounts();
  return (
    <GenericKanbanSettingsDialog
      {...props}
      groupFields={patientFieldsFor(canSeeBilling, KANBAN_GROUP_FIELDS)}
      summaryFields={patientFieldsFor(canSeeBilling, KANBAN_SUMMARY_FIELDS)}
      defaultGroupField="status"
    />
  );
}
