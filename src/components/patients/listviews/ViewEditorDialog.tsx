// Thin wrapper over the generic src/components/listViews/ViewEditorDialog.tsx -
// binds PATIENT_FIELDS, the patient picklist option lists and the doctor
// options into the generic filter/column/sharing editor, and re-exports
// FieldPicker under its original signature (still imported by
// FieldsDisplayDialog.tsx) so nothing else in the Patients page changes.
import GenericViewEditorDialog, {
  FieldPicker as GenericFieldPicker,
  type PickOption,
} from "@/components/listViews/ViewEditorDialog";
import {
  PATIENT_FIELDS, DEFAULT_VIEW_COLUMNS,
  GENDER_OPTIONS, STATUS_OPTIONS, SKIN_TYPE_OPTIONS, BLOOD_GROUP_OPTIONS, SOURCE_OPTIONS,
  ENGAGEMENT_TIER_OPTIONS,
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
  return <GenericFieldPicker fields={PATIENT_FIELDS} columns={columns} onChange={onChange} />;
}

export default function ViewEditorDialog({ doctorOptions, ...rest }: Props) {
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

  return (
    <GenericViewEditorDialog
      {...rest}
      fields={PATIENT_FIELDS}
      defaultColumns={DEFAULT_VIEW_COLUMNS}
      optionsFor={optionsFor}
      itemLabel="patients"
    />
  );
}
