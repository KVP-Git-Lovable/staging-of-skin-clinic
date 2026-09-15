import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Pin } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { PinnedReportWidget } from "./PinnedReportWidget";
import {
  getObjectByKey,
  type SavedReport,
  type ReportFilter,
} from "@/lib/reportObjects";

/**
 * Best-effort date column for each report object. We use these to inject the
 * dashboard date-range filter into pinned widgets when the underlying object
 * exposes a comparable date field.
 */
const OBJECT_DATE_FIELD: Record<string, string> = {
  appointments: "start_time",
  procedures: "procedure_date",
  invoices: "created_at",
  patients: "created_at",
  pharma_products: "created_at",
  asset_issues: "reported_date",
  leave_applications: "start_date",
  expenses: "expense_date",
  patient_feedback: "created_at",
};

/**
 * Object → field name (when present) used to filter by a single staff member.
 * Only added when the dashboard's staff filter is set to a specific staffer.
 */
const OBJECT_STAFF_FIELD: Record<string, string> = {
  appointments: "staff_id",
  leave_applications: "staff_id",
};

interface Props {
  start: Date;
  end: Date;
  staffId: string; // "all" or specific UUID
}

export function PinnedReports({ start, end, staffId }: Props) {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: pins = [] } = useQuery({
    queryKey: ["dashboard-pins", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("dashboard_pins")
        .select("id, position, report_id, saved_reports(*)")
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        id: row.id as string,
        position: row.position as number,
        report_id: row.report_id as string,
        saved_reports: row.saved_reports
          ? ({
              ...row.saved_reports,
              columns: row.saved_reports.columns || [],
              group_rows: row.saved_reports.group_rows || [],
              group_columns: row.saved_reports.group_columns || [],
              filters: row.saved_reports.filters || [],
              display_options: row.saved_reports.display_options || undefined,
            } as SavedReport)
          : null,
      }));
    },
  });

  const handleUnpin = async (pinId: string) => {
    const { error } = await supabase.from("dashboard_pins").delete().eq("id", pinId);
    if (error) {
      toast.error("Failed to unpin report");
      return;
    }
    toast.success("Report unpinned from Dashboard");
    qc.invalidateQueries({ queryKey: ["dashboard-pins"] });
  };

  const validPins = useMemo(
    () => pins.filter((p) => p.saved_reports),
    [pins]
  );

  const buildExtraFilters = (report: SavedReport): { extra: ReportFilter[]; applied: boolean } => {
    const extra: ReportFilter[] = [];
    let applied = false;
    const obj = getObjectByKey(report.primary_object);
    if (!obj) return { extra, applied };

    // Date range injection (best-effort)
    const dateField = OBJECT_DATE_FIELD[report.primary_object];
    if (dateField && obj.fields.some((f) => f.key === dateField)) {
      extra.push(
        {
          field: `${report.primary_object}.${dateField}`,
          operator: "gte",
          value: start.toISOString(),
          objectKey: report.primary_object,
        },
        {
          field: `${report.primary_object}.${dateField}`,
          operator: "lte",
          value: end.toISOString(),
          objectKey: report.primary_object,
        }
      );
      applied = true;
    }

    // Staff filter injection (best-effort)
    if (staffId !== "all") {
      const staffField = OBJECT_STAFF_FIELD[report.primary_object];
      if (staffField && obj.fields.some((f) => f.key === staffField)) {
        extra.push({
          field: `${report.primary_object}.${staffField}`,
          operator: "equals",
          value: staffId,
          objectKey: report.primary_object,
        });
        applied = true;
      }
    }

    return { extra, applied };
  };

  if (!user || validPins.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.18 }}
        className="data-table p-5 mb-6 flex items-center gap-3 text-sm text-muted-foreground"
      >
        <Pin className="h-4 w-4 shrink-0" />
        <span>
          Pin reports from the{" "}
          <a href="/report-builder" className="text-primary hover:underline">
            Report Builder
          </a>{" "}
          to see them as live widgets here.
        </span>
      </motion.div>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18 }}
      className="mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Pin className="h-4 w-4 text-primary" />
        <h2 className="font-display font-semibold text-base md:text-lg">
          Pinned Reports
        </h2>
        <span className="text-xs text-muted-foreground">({validPins.length})</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {validPins.map((p) => {
          const report = p.saved_reports!;
          const { extra, applied } = buildExtraFilters(report);
          return (
            <PinnedReportWidget
              key={p.id}
              pinId={p.id}
              report={report}
              extraFilters={extra}
              filteredByDashboard={applied}
              onUnpin={handleUnpin}
            />
          );
        })}
      </div>
    </motion.section>
  );
}
