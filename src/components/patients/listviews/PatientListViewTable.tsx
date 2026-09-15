// Thin wrapper over the generic src/components/listViews/ListViewTable.tsx -
// supplies PATIENT_FIELDS/rawValue and the two Patients-specific cell
// renderings (avatar+name, colored status badge) via renderCell, so nothing
// else in the Patients page needs to change.
import GenericListViewTable, { type SortDir } from "@/components/listViews/ListViewTable";
import { PATIENT_FIELDS, rawValue } from "@/lib/patientFields";
import { PatientAvatar } from "@/components/patients/PatientAvatar";

export type { SortDir };

interface Props {
  rows: any[];
  columns: string[];
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (row: any) => void;
  doctorLabels?: Record<string, string>;
  avatars?: Record<string, string>;
  sortKey?: string | null;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  /** Enables inline editing of the cell values. */
  onInlineSave?: (row: any, key: string, value: any) => Promise<void> | void;
  picklistOptions?: Record<string, { value: string; label: string }[]>;
}

/** Columns that are computed / read-only and cannot be edited inline. */
const READ_ONLY = [
  "full_name",
  "created_at",
  "updated_at",
  "total_visits",
  "lifetime_value",
  "days_since_last_visit",
  "engagement_tier",
  "age",
];

export default function PatientListViewTable({ avatars = {}, ...rest }: Props) {
  return (
    <GenericListViewTable
      {...rest}
      fields={PATIENT_FIELDS}
      rawValue={rawValue}
      readOnlyKeys={READ_ONLY}
      renderCell={(row, key, value, editAffordance) => {
        if (key === "full_name") {
          return (
            <div className="flex items-center gap-3 text-sm font-medium">
              <PatientAvatar
                firstName={row.first_name}
                lastName={row.last_name}
                photoUrl={avatars[row.id]}
                className="h-9 w-9"
              />
              <span className="line-clamp-2">{value}</span>
            </div>
          );
        }
        if (key === "status") {
          return (
            <span className="inline-flex items-center gap-2">
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  row.status === "Active" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                }`}
              >
                {row.status || "—"}
              </span>
              {editAffordance}
            </span>
          );
        }
        return null;
      }}
    />
  );
}
