// Thin wrapper over the generic src/components/listViews/ListKanban.tsx -
// supplies PATIENT_FIELDS/rawValue and the PatientAvatar card leading
// visual so nothing else in the Patients page needs to change.
import GenericListKanban from "@/components/listViews/ListKanban";
import { PATIENT_FIELDS, rawValue, type KanbanConfig } from "@/lib/patientFields";
import { PatientAvatar } from "@/components/patients/PatientAvatar";

interface Option { value: string; label: string }

interface Props {
  rows: any[];
  config: KanbanConfig;
  /** Picklist options for the grouping field. */
  options: Option[];
  columns: string[];
  avatars?: Record<string, string>;
  onOpen: (row: any) => void;
  onMove: (row: any, field: string, value: string) => void;
}

export default function PatientKanban({ avatars = {}, ...rest }: Props) {
  return (
    <GenericListKanban
      {...rest}
      fields={PATIENT_FIELDS}
      rawValue={rawValue}
      titleField="full_name"
      renderLeading={(row) => (
        <PatientAvatar
          firstName={row.first_name}
          lastName={row.last_name}
          photoUrl={avatars[row.id]}
          className="h-8 w-8"
        />
      )}
    />
  );
}
