import { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getReport } from "@/lib/reportsCatalog";
import { useAuth } from "@/hooks/useAuth";
import { useMoneyFormat } from "@/lib/currency";
import { ReportFilterBar, type FilterState } from "@/components/reports/ReportFilterBar";
import { DEFAULT_REPORT_PRESET, getReportDateRange, loadReportPin } from "@/lib/reportDateRange";
import { SortableDataTable } from "@/components/reports/SortableDataTable";
import { ReportChart } from "@/components/reports/ReportChart";
import { downloadReportPdf } from "@/lib/reportPdf";
import { toast } from "sonner";
import NotFound from "./NotFound";
import { endOfDay } from "date-fns";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function toCSV(columns: { key: string; label: string; accessor?: (r: any) => any }[], rows: any[]) {
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((r) =>
      columns
        .map((c) => {
          const v = c.accessor ? c.accessor(r) : r[c.key];
          if (v == null) return "";
          return `"${String(v).replace(/"/g, '""')}"`;
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

const ReportView = () => {
  const { key } = useParams<{ key: string }>();
  const report = key ? getReport(key) : undefined;

  const { reportPeriodLimit } = useAuth();
  useMoneyFormat(); // keeps currency formatting in step with admin settings
  const dayOnly = reportPeriodLimit === "day";

  const [filterState, setFilterState] = useState<FilterState>(() => {
    if (reportPeriodLimit === "day") {
      return { search: "", dateFrom: startOfToday(), dateTo: startOfToday(), selects: {} };
    }
    // Reports start on the pinned period (current month by default) so a first run
    // never scans the whole history.
    const pin = loadReportPin();
    const preset = pin?.preset || DEFAULT_REPORT_PRESET;
    const { start, end } = getReportDateRange(preset, pin?.customStart, pin?.customEnd);
    return {
      search: "",
      datePreset: preset,
      customStart: pin?.customStart,
      customEnd: pin?.customEnd,
      dateFrom: start,
      dateTo: end,
      selects: {
        ...(pin?.doctor ? { doctor: pin.doctor } : {}),
        ...(pin?.service ? { service: pin.service } : {}),
      },
    };
  });

  // reportPeriodLimit arrives asynchronously with the staff profile, so the initial
  // state above can be built before it is known. Seed the day once it lands.
  useEffect(() => {
    if (!dayOnly) return;
    setFilterState((prev) =>
      prev.datePreset === undefined && prev.dateFrom
        ? prev
        : { ...prev, datePreset: undefined, dateFrom: startOfToday(), dateTo: startOfToday() },
    );
  }, [dayOnly]);
  const [page, setPage] = useState(1);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [exporting, setExporting] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(filterState.search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [filterState.search]);

  useEffect(() => {
    setPage(1);
  }, [filterState.dateFrom, filterState.dateTo, JSON.stringify(filterState.selects)]);

  if (!report) return <NotFound />;

  // Clamp on the way into the query, not just in the picker: this window is what the
  // fetchers (and the CSV export, which reuses these rows) actually receive, so a
  // stale or hand-edited filter state cannot widen the range.
  const rangeStart = dayOnly ? filterState.dateFrom ?? startOfToday() : filterState.dateFrom;
  const rangeEnd = dayOnly ? rangeStart : filterState.dateTo;

  const fromIso = rangeStart ? rangeStart.toISOString() : undefined;
  // Presets already hand back an end-of-day Date; a calendar pick lands at
  // midnight. endOfDay() makes the upper bound inclusive in both cases without
  // spilling into the next day.
  const toIso = rangeEnd ? endOfDay(rangeEnd).toISOString() : undefined;

  const isPaged = !!report.paged;

  // Non-paged path
  const { data: rawRows = [], isLoading } = useQuery({
    queryKey: ["report", report.key, fromIso, toIso],
    queryFn: () => report.fetcher({ from: fromIso, to: toIso }),
    enabled: !isPaged,
  });

  // Paged path
  const pagedQuery = useQuery({
    queryKey: ["report-paged", report.key, page, fromIso, toIso, debouncedSearch, JSON.stringify(filterState.selects)],
    queryFn: () =>
      report.paged!.fetchPage({
        page,
        from: fromIso,
        to: toIso,
        search: debouncedSearch,
        selects: filterState.selects,
      }),
    enabled: isPaged,
    placeholderData: keepPreviousData,
  });

  const chartQuery = useQuery({
    queryKey: ["report-paged-chart", report.key, fromIso, toIso],
    queryFn: () => report.paged!.chartFetch!({ from: fromIso, to: toIso }),
    enabled: isPaged && !!report.paged?.chartFetch,
    staleTime: 5 * 60 * 1000,
  });

  const summaryQuery = useQuery({
    queryKey: ["report-paged-summary", report.key, fromIso, toIso, debouncedSearch, JSON.stringify(filterState.selects)],
    queryFn: () =>
      report.paged!.summaryFetch!({
        from: fromIso,
        to: toIso,
        search: debouncedSearch,
        selects: filterState.selects,
      }),
    enabled: isPaged && !!report.paged?.summaryFetch,
  });

  const filteredRows = useMemo(() => {
    if (isPaged) return pagedQuery.data?.rows ?? [];
    let rows = rawRows as any[];
    // Select filters
    for (const f of report.filters) {
      const v = filterState.selects[f.key];
      if (!v) continue;
      if (f.type === "doctor" || f.type === "service") {
        if (f.matches) rows = rows.filter((r) => f.matches!(r, v));
        continue;
      }
      if (f.type !== "select") continue;
      const field = f.field || f.key;
      rows = rows.filter((r) => String(r[field] ?? "") === v);
    }
    // Search
    const q = filterState.search.trim().toLowerCase();
    if (q && report.searchFields?.length) {
      rows = rows.filter((r) =>
        report.searchFields!.some((field) => String(r[field] ?? "").toLowerCase().includes(q)),
      );
    }
    return rows;
  }, [rawRows, filterState, report, isPaged, pagedQuery.data]);

  const summary = isPaged
    ? summaryQuery.data ?? []
    : report.summary?.(filteredRows) ?? [];

  const total = isPaged ? pagedQuery.data?.total ?? 0 : filteredRows.length;
  const pageSize = report.paged?.pageSize ?? 50;
  const totalPages = isPaged ? Math.max(1, Math.ceil(total / pageSize)) : 1;
  const loading = isPaged ? pagedQuery.isLoading : isLoading;

  const noRows = !filteredRows.length && !isPaged;
  const busy = exporting || exportingPdf;

  // Both exports cover the whole filtered set, not the page on screen. Shared so a
  // change to one can never leave the other exporting a different set of rows.
  const rowsForExport = async () => {
    if (!isPaged || !report.paged?.fetchAllForExport) return filteredRows;
    try {
      setExporting(true);
      return await report.paged.fetchAllForExport({
        from: fromIso,
        to: toIso,
        search: debouncedSearch,
        selects: filterState.selects,
      });
    } finally {
      setExporting(false);
    }
  };

  const downloadCsv = async () => {
    const rows = await rowsForExport();
    const csv = toCSV(report.columns, rows);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.key}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPdf = async () => {
    try {
      setExportingPdf(true);
      const rows = await rowsForExport();
      await downloadReportPdf({ report, rows, summary, filterState, dayOnly });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div>
          <Link to="/reports" className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground mb-1">
            <ArrowLeft className="h-3 w-3 mr-1" /> Back to Reports
          </Link>
          <h1 className="page-title">{report.title}</h1>
          <p className="page-subtitle">{report.description}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={downloadCsv} disabled={noRows || busy}>
            {exporting ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Download className="h-4 w-4 mr-1.5" />}
            Export CSV
          </Button>
          <Button variant="outline" size="sm" onClick={downloadPdf} disabled={noRows || busy}>
            {exportingPdf ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FileText className="h-4 w-4 mr-1.5" />}
            Export PDF
          </Button>
        </div>
      </div>

      <ReportFilterBar
        filters={report.filters}
        state={filterState}
        onChange={setFilterState}
        singleDay={dayOnly}
      />

      {summary.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {summary.map((s) => (
            <div key={s.label} className="data-table p-3">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
              <div className="text-lg font-semibold mt-0.5">{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {isPaged && report.paged?.chartFetch && chartQuery.data && (
        <ReportChart
          title={report.chart?.title ?? "Chart"}
          data={chartQuery.data}
          valueLabel={report.chart?.valueLabel}
          orientation={report.chart?.orientation}
          reportKey={report.key}
        />
      )}

      {!isPaged && report.chart && !isLoading && (
        <ReportChart
          title={report.chart.title}
          data={report.chart.build(filteredRows)}
          valueLabel={report.chart.valueLabel}
          orientation={report.chart.orientation}
          reportKey={report.key}
        />
      )}

      {loading ? (
        <div className="data-table p-12 flex items-center justify-center text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading…
        </div>
      ) : isPaged ? (
        <>
          <SortableDataTable
            columns={report.columns}
            rows={filteredRows}
            rowHref={report.rowHref}
            defaultSort={report.defaultSort}
            pageSize={pageSize}
          />
          <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
            <span>
              Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, total)} of {total.toLocaleString()}
              {pagedQuery.isFetching && !pagedQuery.isLoading ? " · loading…" : ""}
              <span className="ml-2 italic">Sort applies to current page</span>
            </span>
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  Previous
                </Button>
                <span>Page {page} of {totalPages}</span>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  Next
                </Button>
              </div>
            )}
          </div>
        </>
      ) : (
        <SortableDataTable
          columns={report.columns}
          rows={filteredRows}
          rowHref={report.rowHref}
          defaultSort={report.defaultSort}
        />
      )}
    </div>
  );
};

export default ReportView;