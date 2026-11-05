// Thin wrapper over the generic src/components/listViews/ViewEditorDialog.tsx -
// binds PATIENT_FIELDS, the patient picklist option lists and the doctor
// options into the generic filter/column/sharing editor, and re-exports
// FieldPicker under its original signature (still imported by
// FieldsDisplayDialog.tsx) so nothing else in the Patients page changes.
//
// For a role that may not see billing amounts the money fields are not offered,
// and the money columns / money filter conditions a saved view already holds are
// carried through a save untouched (a view can be shared).
import GenericViewEditorDialog, {
  FieldPicker as GenericFieldPicker,
  type PickOption,
} from "@/components/listViews/ViewEditorDialog";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import {
  PATIENT_FIELDS, DEFAULT_VIEW_COLUMNS,
  GENDER_OPTIONS, STATUS_OPTIONS, SKIN_TYPE_OPTIONS, BLOOD_GROUP_OPTIONS, SOURCE_OPTIONS,
  ENGAGEMENT_TIER_OPTIONS,
  patientFieldsFor, patientKeysFor, isBillingPatientField,
  type ListView,
} from "@/lib/patientFields";

export type { PickOption };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  view: ListView | null;
  onSave: (v: Partial<ListView> & { name: string }) => void;
  doctorOptions: PickOption[];
  people: PickOption[];
}

export function FieldPicker({ columns, onChange }: { columns: string[]; onChange: (next: string[]) => void }) {
  const canSeeBilling = useCanSeeBillingAmounts();
  return <GenericFieldPicker fields={patientFieldsFor(canSeeBilling, PATIENT_FIELDS)} columns={columns} onChange={onChange} />;
}

export default function ViewEditorDialog({ doctorOptions, view, onSave, ...rest }: Props) {
  const canSeeBilling = useCanSeeBillingAmounts();

  const optionsFor = (source?: string): PickOption[] => {
    switch (source) {
      case "gender": return GENDER_OPTIONS;
      case "status": return STATUS_OPTIONS;
      case "skin_type": return SKIN_TYPE_OPTIONS;
      case "blood_group": return BLOOD_GROUP_OPTIONS;
      case "source": return SOURCE_OPTIONS;
      case "engagement_tier": return ENGAGEMENT_TIER_OPTIONS;
      case "doctor": return doctorOptions;
      default: return [];
    }
  };

  // Restricted: the editor sees the view without its money columns/conditions,
  // and the save puts them back.
  const hiddenColumns = !canSeeBilling && view ? (view.columns ?? []).filter(isBillingPatientField) : [];
  const hiddenConditions =
    !canSeeBilling && view ? (view.filters?.conditions ?? []).filter((c) => isBillingPatientField(c.field)) : [];
  const editorView: ListView | null =
    canSeeBilling || !view
      ? view
      : {
          ...view,
          columns: patientKeysFor(false, view.columns ?? []),
          filters: view.filters
            ? { ...view.filters, conditions: view.filters.conditions.filter((c) => !isBillingPatientField(c.field)) }
            : view.filters,
        };
  const save = canSeeBilling || !view
    ? onSave
    : (v: Partial<ListView> & { name: string }) =>
        onSave({
          ...v,
          columns: v.columns ? [...v.columns, ...hiddenColumns] : v.columns,
          filters: v.filters ? { ...v.filters, conditions: [...v.filters.conditions, ...hiddenConditions] } : v.filters,
        });

  return (
    <GenericViewEditorDialog
      {...rest}
      view={editorView}
      onSave={save}
      fields={patientFieldsFor(canSeeBilling, PATIENT_FIELDS)}
      defaultColumns={patientKeysFor(canSeeBilling, DEFAULT_VIEW_COLUMNS)}
      optionsFor={optionsFor}
      itemLabel="patients"
    />
  );
}
