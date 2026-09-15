// Generic saved-views table, extracted from
// src/components/patients/listviews/PatientListViewTable.tsx. Field config
// and per-row raw-value resolution are passed in (instead of importing
// PATIENT_FIELDS/rawValue), and a `renderCell` override lets a module draw
// a custom cell body (e.g. Patients' avatar+name column, a status badge)
// while everything else - sorting, inline edit, selection - stays generic.
import { useEffect, useRef, useState } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ArrowDown, ArrowUp, ArrowUpDown, Pencil } from "lucide-react";
import { useStackedTable } from "@/hooks/useStackedTable";
import {
  type FieldDef,
  type RawValueFn,
  defaultRawValue,
  fieldDefIn,
  formatCell as formatCellGeneric,
} from "@/lib/listViews/engine";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type SortDir = "asc" | "desc";

interface Props {
  rows: any[];
  columns: string[];
  fields: FieldDef[];
  rawValue?: RawValueFn;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (row: any) => void;
  doctorLabels?: Record<string, string>;
  sortKey?: string | null;
  sortDir?: SortDir;
  onSort?: (key: string) => void;
  /** Enables inline editing of the cell values. */
  onInlineSave?: (row: any, key: string, value: any) => Promise<void> | void;
  picklistOptions?: Record<string, { value: string; label: string }[]>;
  /** Columns that are computed / read-only and cannot be edited inline. */
  readOnlyKeys?: string[];
  /** Custom rendering for a cell's body. Return null/undefined to fall back to the default text cell. `editAffordance` is the inline-edit pencil button (if this column is editable) - splice it into your custom markup if you want it. */
  renderCell?: (row: any, key: string, value: string, editAffordance: React.ReactNode) => React.ReactNode | null | undefined;
}

export default function ListViewTable({
  rows, columns, fields, rawValue = defaultRawValue, selectedIds, onToggle, onToggleAll, onOpen,
  doctorLabels = {}, sortKey = null, sortDir = "asc", onSort, onInlineSave, picklistOptions = {},
  readOnlyKeys = [], renderCell,
}: Props) {
  const tableRef = useStackedTable<HTMLTableElement>();
  const allSelected = rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const [editing, setEditing] = useState<{ id: string; key: string } | null>(null);
  const [draft, setDraft] = useState<string>("");
  const inputRef = useRef<HTMLInputElement>(null);
  const readOnly = new Set(readOnlyKeys);
  const labelFor = (key: string) => fieldDefIn(fields, key)?.label ?? key;

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const cell = (row: any, key: string) => {
    if (key === "doctor_id" || fieldDefIn(fields, key)?.optionsSource === "doctor") {
      const id = rawValue(row, key) as string | null;
      return id ? doctorLabels[id] ?? "—" : "—";
    }
    return formatCellGeneric(row, key, fields, rawValue);
  };

  const canEdit = (key: string) => !!onInlineSave && !readOnly.has(key);

  const startEdit = (row: any, key: string) => {
    if (!canEdit(key)) return;
    const v = rawValue(row, key);
    setDraft(v == null ? "" : String(v));
    setEditing({ id: row.id, key });
  };

  const commit = async (row: any, key: string, value: string) => {
    setEditing(null);
    const original = rawValue(row, key);
    const next = value === "" ? null : value;
    if (String(original ?? "") === String(next ?? "")) return;
    await onInlineSave?.(row, key, next);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="h-3 w-3 text-primary" /> : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  const renderEditor = (row: any, key: string) => {
    const def = fieldDefIn(fields, key);
    const options = def?.optionsSource === "doctor"
      ? Object.entries(doctorLabels).map(([value, label]) => ({ value, label }))
      : picklistOptions[def?.optionsSource ?? ""] ?? [];

    if (def?.type === "picklist" && options.length > 0) {
      return (
        <Select
          defaultValue={draft || undefined}
          onValueChange={(v) => commit(row, key, v)}
          open
          onOpenChange={(o) => !o && setEditing(null)}
        >
          <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent className="z-50 bg-popover">
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }

    return (
      <Input
        ref={inputRef}
        className="h-8 text-sm"
        type={def?.type === "date" ? "date" : def?.type === "number" ? "number" : "text"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit(row, key, draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit(row, key, draft);
          if (e.key === "Escape") setEditing(null);
        }}
      />
    );
  };

  return (
    <div className="overflow-x-auto table-scroll">
      <table ref={tableRef} className="w-full responsive-table">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="p-4 w-10">
              <Checkbox checked={allSelected} onCheckedChange={onToggleAll} aria-label="Select all" />
            </th>
            {columns.map((key) => (
              <th key={key} className="text-left text-xs font-medium text-muted-foreground p-4 whitespace-nowrap">
                {onSort ? (
                  <button
                    type="button"
                    onClick={() => onSort(key)}
                    className="inline-flex items-center gap-1.5 hover:text-foreground transition-colors"
                    title="Sort ascending / descending / clear"
                  >
                    {labelFor(key)}
                    <SortIcon column={key} />
                  </button>
                ) : (
                  labelFor(key)
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => (
            <tr key={row.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => onOpen(row)}>
              <td className="p-4" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={selectedIds.has(row.id)} onCheckedChange={() => onToggle(row.id)} aria-label="Select row" />
              </td>
              {columns.map((key) => {
                const def = fieldDefIn(fields, key);
                const value = cell(row, key);
                const isEditing = editing?.id === row.id && editing.key === key;

                if (isEditing) {
                  return (
                    <td key={key} className="p-2" data-label={labelFor(key)} onClick={(e) => e.stopPropagation()}>
                      {renderEditor(row, key)}
                    </td>
                  );
                }

                const editAffordance = canEdit(key) && (
                  <button
                    type="button"
                    aria-label={`Edit ${labelFor(key)}`}
                    className="opacity-0 group-hover/cell:opacity-100 transition-opacity text-muted-foreground hover:text-primary"
                    onClick={(e) => { e.stopPropagation(); startEdit(row, key); }}
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                );

                const custom = renderCell?.(row, key, value, editAffordance);
                if (custom) {
                  return (
                    <td key={key} className="p-4 group/cell" data-label={labelFor(key)}>
                      {custom}
                    </td>
                  );
                }

                return (
                  <td
                    key={key}
                    data-label={labelFor(key)}
                    className={`p-4 text-sm group/cell ${def?.type === "number" ? "tabular-nums" : ""} text-muted-foreground`}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span className="line-clamp-2">{value}</span>
                      {editAffordance}
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
