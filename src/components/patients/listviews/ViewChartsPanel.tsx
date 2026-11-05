// Thin wrapper over the generic src/components/listViews/ViewChartsPanel.tsx -
// binds PATIENT_FIELDS/rawValue so nothing else in the Patients page needs
// to change.
//
// A role that may not see billing amounts is not offered the money fields to
// group or sum by. (Patients.tsx already hides saved charts that use them and
// merges them back on save.)
import GenericViewChartsPanel from "@/components/listViews/ViewChartsPanel";
import { useCanSeeBillingAmounts } from "@/hooks/useCanSeeBillingAmounts";
import { PATIENT_FIELDS, rawValue, patientFieldsFor, type ViewChart } from "@/lib/patientFields";

interface Props {
  charts: ViewChart[];
  rows: any[];
  canManage: boolean;
  onChange: (charts: ViewChart[]) => void;
  onClose: () => void;
}

export default function ViewChartsPanel(props: Props) {
  const canSeeBilling = useCanSeeBillingAmounts();
  return (
    <GenericViewChartsPanel
      {...props}
      fields={patientFieldsFor(canSeeBilling, PATIENT_FIELDS)}
      rawValue={rawValue}
      itemLabel="Patients"
      defaultGroupField="status"
    />
  );
}
