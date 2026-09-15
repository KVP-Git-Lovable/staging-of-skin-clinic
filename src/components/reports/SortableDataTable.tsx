import { useState, useMemo } from "react";
import { ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import type { ReportColumn } from "@/lib/reportsCatalog";
import { cn } from "@/lib/utils";
import { formatMoneyCompact, formatNumber } from "@/lib/currency";
import { useNavigate } from "react-router-dom";

interface Props {
  columns: ReportColumn[];
  rows: any[];
  rowHref?: (row: any) => string | null;
  defaultSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
}

function getCellValue(col: ReportColumn, row: any) {
  if (col.accessor) return col.accessor(row);
  return row[col.key];
}

function renderCell(col: ReportColumn, row: any) {
  if (col.render) return col.render(row);
  const v = getCellValue(col, row);
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  switch (col.type) {
    case "currency":
      return formatMoneyCompact(Number(v));
    case "number":
      return formatNumber(Number(v));
    case "date":
      try { return format(new Date(v), "dd MMM yyyy"); } catch { return String(v); }
    case "datetime":
      try { return format(new Date(v), "dd MMM yyyy h:mm a"); } catch { return String(v); }
    case "badge":
      return <Badge variant="secondary" className="text-[10px]">{String(v)}</Badge>;
    default:
      return String(v);
  }
}

export function SortableDataTable({ columns, rows, rowHref, defaultSort, pageSize = 50 }: Props) {
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(defaultSort ?? null);
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const copy = [...rows];
    copy.sort((a, b) => {
      const av = getCellValue(col, a);
      const bv = getCellValue(col, b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (col.type === "date" || col.type === "datetime") {
        cmp = new Date(av).getTime() - new Date(bv).getTime();
      } else if (col.type === "currency" || col.type === "number") {
        cmp = Number(av) - Number(bv);
      } else {
        cmp = String(av).localeCompare(String(bv));
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [rows, sort, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (key: string) => {
    setPage(1);
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  const handleRowClick = (row: any, e?: React.MouseEvent) => {
    const href = rowHref?.(row);
    if (!href) return;
    // Remember the report we came from so a "Back to Report" button can return here
    try {
      const current = window.location.pathname + window.location.search;
      if (current.startsWith("/reports/")) {
        sessionStorage.setItem("reportReferrer", current);
      }
    } catch {}
    navigate(href);
  };

  return (
    <div className="data-table overflow-hidden">
      {/* Mobile: stacked cards so no horizontal scrolling is needed */}
      <div className="md:hidden divide-y">
        {pageRows.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">
            No records match the current filters.
          </div>
        ) : pageRows.map((row, i) => (
          <div
            key={row.id ?? i}
            onClick={() => handleRowClick(row)}
            className={cn("p-3 space-y-1.5", rowHref && "active:bg-primary/5 cursor-pointer")}
          >
            {columns.map((col, idx) => (
              <div key={col.key} className="flex items-start justify-between gap-3">
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground shrink-0">
                  {col.label}
                </span>
                <span className={cn("text-xs text-right break-words", idx === 0 && rowHref && "text-primary font-medium")}>
                  {renderCell(col, row)}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-auto max-h-[calc(100vh-340px)] table-scroll">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
            <tr className="border-b">
              {columns.map((col) => {
                const active = sort?.key === col.key;
                const Icon = active ? (sort?.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
                return (
                  <th key={col.key} className="text-left px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap">
                    {col.sortable ? (
                      <button
                        onClick={() => toggleSort(col.key)}
                        className={cn("inline-flex items-center gap-1 hover:text-foreground", active && "text-foreground")}
                      >
                        {col.label}
                        <Icon className="h-3 w-3" />
                      </button>
                    ) : col.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="text-center py-12 text-sm text-muted-foreground">
                  No records match the current filters.
                </td>
              </tr>
            ) : pageRows.map((row, i) => (
              <tr
                key={row.id ?? i}
                onClick={() => handleRowClick(row)}
                className={cn(
                  "border-b last:border-0 transition-colors",
                  i % 2 === 1 && "bg-muted/20",
                  rowHref && "cursor-pointer hover:bg-primary/5",
                )}
              >
                {columns.map((col, idx) => (
                  <td key={col.key} className={cn("px-3 py-2 text-xs whitespace-nowrap", idx === 0 && rowHref && "text-primary font-medium")}>
                    {renderCell(col, row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sorted.length > pageSize && (
        <div className="flex items-center justify-between px-3 py-2 border-t text-xs text-muted-foreground">
          <div>
            Showing {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, sorted.length)} of {sorted.length}
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" disabled={safePage === 1} onClick={() => setPage(safePage - 1)}>Previous</Button>
            <Button size="sm" variant="outline" disabled={safePage === totalPages} onClick={() => setPage(safePage + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}