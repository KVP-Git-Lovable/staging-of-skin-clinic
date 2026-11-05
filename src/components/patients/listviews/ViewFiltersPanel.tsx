// Thin wrapper over the generic src/components/listViews/ViewFiltersPanel.tsx -
// binds PATIENT_FIELDS and the patient picklist option lists so nothing
// else in the Patients page needs to change.
//
// For a role that may not see billing amounts the money fields are not offered,
// and money conditions a saved view already holds are carried through a save
// untouched (a view can be shared).
import GenericViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import {
  PATIENT_FIELDS,
  GENDER_OPTIONS, STATUS_OPTIONS, SKIN_TYPE_OPTIONS, BLOOD_GROUP_OPTIONS, SOURCE_OPTIONS,
  ENGAGEMENT_TIER_OPTIONS,
  patientFieldsFor, isBillingPatientField,
  type FilterCondition,
  type ListView,
} from "@/lib/patientFields";

interface PickOption { value: string; label: string }

interface Props {
  view: ListView | null;
  canManage: boolean;
  doctorOptions: PickOption[];
  onSave: (filters: { match: "all" | "any"; conditions: FilterCondition[] }) => void;
  onClose: () => void;
}

export default function ViewFiltersPanel({ doctorOptions, view, onSave, ...rest }: Props) {
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

  const hiddenConditions =
    !canSeeBilling && view ? (view.filters?.conditions ?? []).filter((c) => isBillingPatientField(c.field)) : [];
  const panelView: ListView | null =
    canSeeBilling || !view || !view.filters
      ? view
      : { ...view, filters: { ...view.filters, conditions: view.filters.conditions.filter((c) => !isBillingPatientField(c.field)) } };
  const save = canSeeBilling || !view
    ? onSave
    : (f: { match: "all" | "any"; conditions: FilterCondition[] }) =>
        onSave({ ...f, conditions: [...f.conditions, ...hiddenConditions] });

  return (
    <GenericViewFiltersPanel
      {...rest}
      view={panelView}
      onSave={save}
      fields={patientFieldsFor(canSeeBilling, PATIENT_FIELDS)}
      optionsFor={optionsFor}
      itemLabel="patients"
    />
  );
}
