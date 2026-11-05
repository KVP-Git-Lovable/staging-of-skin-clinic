// Thin wrapper over the generic src/components/listViews/FieldsDisplayDialog.tsx -
// binds PATIENT_FIELDS/DEFAULT_VIEW_COLUMNS so nothing else in the Patients
// page needs to change.
//
// For a role that may not see billing amounts, the money fields are not offered,
// and any money columns the saved view already holds are carried through a save
// untouched - a view can be shared, so a restricted user tidying it must not
// strip those columns for everyone else.
import GenericFieldsDisplayDialog from "@/components/listViews/FieldsDisplayDialog";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import {
  PATIENT_FIELDS, DEFAULT_VIEW_COLUMNS,
  patientFieldsFor, patientKeysFor, isBillingPatientField,
} from "@/lib/patientFields";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  viewName: string;
  columns: string[];
  onSave: (columns: string[]) => void;
}

export default function FieldsDisplayDialog(props: Props) {
  const canSeeBilling = useCanSeeBillingAmounts();
  const hidden = canSeeBilling ? [] : props.columns.filter(isBillingPatientField);
  return (
    <GenericFieldsDisplayDialog
      {...props}
      columns={patientKeysFor(canSeeBilling, props.columns)}
      onSave={canSeeBilling ? props.onSave : (cols: string[]) => props.onSave([...cols, ...hidden])}
      fields={patientFieldsFor(canSeeBilling, PATIENT_FIELDS)}
      defaultColumns={patientKeysFor(canSeeBilling, DEFAULT_VIEW_COLUMNS)}
    />
  );
}
