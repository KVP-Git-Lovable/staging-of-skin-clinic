// Thin wrapper over the generic src/components/listViews/ViewChartsPanel.tsx -
// binds PATIENT_FIELDS/rawValue so nothing else in the Patients page needs
// to change.
import GenericViewChartsPanel from "@/components/listViews/ViewChartsPanel";
import { PATIENT_FIELDS, rawValue, type ViewChart } from "@/lib/patientFields";

interface Props {
  charts: ViewChart[];
  rows: any[];
  canManage: boolean;
  onChange: (charts: ViewChart[]) => void;
  onClose: () => void;
}

export default function ViewChartsPanel(props: Props) {
  return (
    <GenericViewChartsPanel
      {...props}
      fields={PATIENT_FIELDS}
      rawValue={rawValue}
      itemLabel="Patients"
      defaultGroupField="status"
    />
  );
}
