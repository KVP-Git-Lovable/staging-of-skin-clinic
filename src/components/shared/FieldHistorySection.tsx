import { History } from "lucide-react";
import { useFieldHistory, humanizeField, useUserNames } from "@/lib/history";

interface Props {
  objectType: string;
  recordId?: string | null;
  className?: string;
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

/** Field-level change log for a record (only fields the admin configured are tracked). */
export function FieldHistorySection({ objectType, recordId, className = "" }: Props) {
  const { data: rows = [], isLoading } = useFieldHistory(objectType, recordId);
  const { data: names = {} } = useUserNames(rows.map((r) => r.changed_by));

  const who = (r: (typeof rows)[number]) =>
    (r.changed_by && names[r.changed_by]) || r.changed_by_name || "User";

  return (
    <div className={`rounded-xl border bg-card p-4 shadow-sm ${className}`}>
      <h3 className="font-display text-sm font-semibold mb-3 flex items-center gap-2">
        <History className="h-4 w-4 text-primary" />
        History Tracking
      </h3>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading history…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No tracked changes yet. Admins can choose the fields to track in Admin → History Tracking.
        </p>
      ) : (
        <div className="overflow-x-auto table-scroll">
          <table className="w-full responsive-table text-sm">
            <thead>
              <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
                <th className="p-2 text-left">Field</th>
                <th className="p-2 text-left">Original Value</th>
                <th className="p-2 text-left">Changed Value</th>
                <th className="p-2 text-left">Changed By</th>
                <th className="p-2 text-left">Changed On</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-muted/30">
                  <td className="p-2 font-medium" data-label="Field">{humanizeField(r.field_name)}</td>
                  <td className="p-2 text-muted-foreground" data-label="Original Value">{r.old_value || "—"}</td>
                  <td className="p-2" data-label="Changed Value">{r.new_value || "—"}</td>
                  <td className="p-2 text-muted-foreground" data-label="Changed By">{who(r)}</td>
                  <td className="p-2 text-muted-foreground whitespace-nowrap" data-label="Changed On">
                    {fmtDate(r.changed_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default FieldHistorySection;
