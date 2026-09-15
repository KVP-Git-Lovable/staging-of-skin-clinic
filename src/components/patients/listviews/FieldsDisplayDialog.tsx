// Thin wrapper over the generic src/components/listViews/FieldsDisplayDialog.tsx -
// binds PATIENT_FIELDS/DEFAULT_VIEW_COLUMNS so nothing else in the Patients
// page needs to change.
import GenericFieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import { PATIENT_FIELDS, DEFAULT_VIEW_COLUMNS } from "@/lib/patientFields";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viewName: string;
  columns: string[];
  onSave: (columns: string[]) => void;
}

export default function FieldsDisplayDialog(props: Props) {
  return <GenericFieldsDisplayDialog {...props} fields={PATIENT_FIELDS} defaultColumns={DEFAULT_VIEW_COLUMNS} />;
}
