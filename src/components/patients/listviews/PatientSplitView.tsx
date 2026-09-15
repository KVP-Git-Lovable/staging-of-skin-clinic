// Thin wrapper over the generic src/components/listViews/ListSplitView.tsx -
// supplies PATIENT_FIELDS/rawValue, the PatientAvatar leading visual and
// the phone/email header meta so nothing else in the Patients page needs
// to change.
import GenericListSplitView from "@/components/listViews/ListSplitView";
import { PATIENT_FIELDS, rawValue } from "@/lib/patientFields";
import { PatientAvatar } from "@/components/patients/PatientAvatar";
import { Mail, Phone } from "lucide-react";

interface Props {
  rows: any[];
  columns: string[];
  avatars?: Record<string, string>;
  onOpen: (row: any) => void;
}

const DETAIL_FIELDS = [
  "phone", "email", "gender", "age", "date_of_birth", "status", "skin_type",
  "blood_group", "city", "source", "total_visits", "lifetime_value",
  "last_visit_date", "engagement_tier", "created_at",
];

export default function PatientSplitView({ rows, columns, avatars = {}, onOpen }: Props) {
  return (
    <GenericListSplitView
      rows={rows}
      columns={columns}
      onOpen={onOpen}
      fields={PATIENT_FIELDS}
      rawValue={rawValue}
      titleField="full_name"
      detailFields={DETAIL_FIELDS}
      renderLeading={(row, size) => (
        <PatientAvatar
          firstName={row.first_name}
          lastName={row.last_name}
          photoUrl={avatars[row.id]}
          className={size === "lg" ? "h-12 w-12" : "h-8 w-8"}
        />
      )}
      renderHeaderMeta={(row) => (
        <>
          {row.phone && (
            <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{row.phone}</span>
          )}
          {row.email && (
            <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{row.email}</span>
          )}
        </>
      )}
    />
  );
}
