// Thin wrapper over the generic src/components/listViews/ViewFiltersPanel.tsx -
// binds PATIENT_FIELDS and the patient picklist option lists so nothing
// else in the Patients page needs to change.
import GenericViewFiltersPanel from "@/components/listViews/ViewFiltersPanel";
import {
  PATIENT_FIELDS,
  GENDER_OPTIONS, STATUS_OPTIONS, SKIN_TYPE_OPTIONS, BLOOD_GROUP_OPTIONS, SOURCE_OPTIONS,
  ENGAGEMENT_TIER_OPTIONS,
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

export default function ViewFiltersPanel({ doctorOptions, ...rest }: Props) {
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
    <GenericViewFiltersPanel
      {...rest}
      fields={PATIENT_FIELDS}
      optionsFor={optionsFor}
      itemLabel="patients"
    />
  );
}
