// Generic split-view (list + detail pane), extracted from
// src/components/patients/listviews/PatientSplitView.tsx. Field config and
// row-value resolution are passed in, and the avatar/header-meta rendering
// (Patients shows a PatientAvatar + phone/email) is pluggable via
// renderLeading/renderHeaderMeta so other modules can supply their own or
// omit them.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import {
  defaultRawValue,
  fieldDefIn,
  formatCell as formatCellGeneric,
  type FieldDef,
  type RawValueFn,
} from "@/lib/listViews/engine";

interface Props {
  rows: any[];
  columns: string[];
  fields: FieldDef[];
  rawValue?: RawValueFn;
  onOpen: (row: any) => void;
  /** Field shown as the row/detail title. Defaults to the first column. */
  titleField?: string;
  /** Fields shown in the detail grid. Defaults to columns minus titleField. */
  detailFields?: string[];
  /** Optional leading visual (e.g. avatar) for a row/detail header. */
  renderLeading?: (row: any, size: "sm" | "lg") => React.ReactNode;
  /** Optional extra meta under the detail title (e.g. phone/email). */
  renderHeaderMeta?: (row: any) => React.ReactNode;
}

export default function ListSplitView({
  rows, columns, fields, rawValue = defaultRawValue, onOpen,
  titleField, detailFields, renderLeading, renderHeaderMeta,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(rows[0]?.id ?? null);
  const title = titleField ?? columns[0] ?? "id";
  const details = detailFields ?? columns.filter((c) => c !== title);

  useEffect(() => {
    if (!rows.some((r) => r.id === selectedId)) setSelectedId(rows[0]?.id ?? null);
  }, [rows, selectedId]);

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const secondary = columns.filter((c) => c !== title).slice(0, 2);
  const formatCell = (row: any, key: string) => formatCellGeneric(row, key, fields, rawValue);

  return (
    <div className="flex flex-col md:flex-row md:h-[70vh]">
      <div className="md:w-80 shrink-0 border-b md:border-b-0 md:border-r border-border overflow-y-auto max-h-[40vh] md:max-h-none">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setSelectedId(row.id)}
            className={`w-full border-b border-border/60 px-3 py-2.5 text-left transition-colors ${
              row.id === selectedId ? "bg-primary/10" : "hover:bg-muted/50"
            }`}
          >
            <div className="flex items-center gap-2.5">
              {renderLeading?.(row, "sm")}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{formatCell(row, title)}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {secondary.map((k) => formatCell(row, k)).filter((v) => v !== "—").join(" · ") || "—"}
                </p>
              </div>
            </div>
          </button>
        ))}
        {rows.length === 0 && <p className="p-4 text-sm text-muted-foreground">No records.</p>}
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-5">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select a record from the list.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {renderLeading?.(selected, "lg")}
                <div>
                  <h3 className="text-lg font-semibold">{formatCell(selected, title)}</h3>
                  {renderHeaderMeta && (
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">{renderHeaderMeta(selected)}</div>
                  )}
                </div>
              </div>
              <Button size="sm" className="gap-2" onClick={() => onOpen(selected)}>
                <ExternalLink className="h-4 w-4" />
                Open full record
              </Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {details.filter((k) => fieldDefIn(fields, k)).map((key) => (
                <div key={key} className="rounded-lg border border-border bg-card p-3 shadow-sm">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{fieldDefIn(fields, key)?.label}</p>
                  <p className="mt-0.5 truncate text-sm font-medium">{formatCell(selected, key)}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
