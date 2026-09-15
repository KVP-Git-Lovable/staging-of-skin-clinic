import { Clock, UserRound } from "lucide-react";
import { useUserNames } from "@/lib/history";
import { RecordOwnerField } from "@/components/shared/RecordOwnerField";

type OwnerObject = "patients" | "appointments" | "procedures" | "invoices" | "pharma_bills";

interface Props {
  record: any;
  className?: string;
  /** Enables the Record Owner lookup for this object. */
  owner?: {
    objectType: OwnerObject;
    objectLabel: string;
    recordLabel: string;
    link?: string;
    onChanged?: (ownerId: string) => void;
  };
}

const fmtDate = (v?: string | null) => {
  if (!v) return "—";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

/**
 * Standard "System Record" block shown on every record: created by / created time
 * and last modified by / modified time.
 */
export function SystemRecordSection({ record, className = "", owner }: Props) {
  const { data: names = {} } = useUserNames([record?.created_by, record?.updated_by]);
  if (!record) return null;

  const nameFor = (id?: string | null) => (id ? names[id] || "User" : "—");

  const items = [
    { icon: UserRound, label: "Created By", value: nameFor(record.created_by) },
    { icon: Clock, label: "Created Time", value: fmtDate(record.created_at) },
    { icon: UserRound, label: "Modified By", value: nameFor(record.updated_by) },
    { icon: Clock, label: "Modified Time", value: fmtDate(record.updated_at ?? record.created_at) },
  ];

  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${className}`}>
      <h3 className="font-display text-sm font-semibold mb-3">System Record</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {owner && record.id && (
          <RecordOwnerField
            objectType={owner.objectType}
            objectLabel={owner.objectLabel}
            recordId={record.id}
            recordLabel={owner.recordLabel}
            ownerId={record.owner_id}
            link={owner.link}
            onChanged={owner.onChanged}
            className="col-span-2 md:col-span-4"
          />
        )}
        {items.map((it, i) => (
          <div key={i} className="rounded-lg border bg-muted/30 px-3 py-2">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <it.icon className="h-3.5 w-3.5" />
              <span className="truncate">{it.label}</span>
            </div>
            <p className="mt-1 text-sm font-medium break-words">{it.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

export default SystemRecordSection;
