import { supabase } from "@/integrations/supabase/client";
import type { JourneySchedule } from "@/lib/comms/schedule";
import type { CanvasData } from "@/lib/comms/journeyGraph";

export type ApprovalStatus = "draft" | "pending" | "approved" | "rejected";
export type JourneyStatus = "draft" | "active" | "paused";
export type Combinator = "union" | "intersection" | "difference";

export interface AudienceSegment {
  key: "A" | "B";
  label: string;
  list_view_id: string;
  entity_type: "patients";
}

export interface AudienceConfig {
  segments: AudienceSegment[];
  combinator: Combinator;
  primary: "A" | "B";
}

export interface Journey {
  id: string;
  name: string;
  description: string | null;
  status: JourneyStatus;
  canvas_data: CanvasData;
  audience_config: AudienceConfig | null;
  approval_status: ApprovalStatus;
  approver_id: string | null;
  submitted_by: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  approval_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  schedule: JourneySchedule | null;
}

export const statusColors: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-success/10 text-success",
  paused: "bg-warning/10 text-warning",
};

export const approvalBadgeClass: Record<string, string> = {
  pending: "bg-warning/10 text-warning",
  approved: "bg-success/10 text-success",
  rejected: "bg-destructive/10 text-destructive",
};

export const approvalLabel: Record<string, string> = {
  pending: "Pending Approval",
  approved: "Approved",
  rejected: "Rejected",
};

export const COMBINATOR_LABELS: Record<Combinator, string> = {
  union: "Union — everyone in A or B",
  intersection: "Intersection — only people in both",
  difference: "Difference — one segment minus the other",
};

export function audienceSummary(config: AudienceConfig | null): string {
  if (!config?.segments?.length) return "—";
  return config.segments.map((s) => s.label).join(config.combinator === "union" ? " + " : config.combinator === "intersection" ? " ∩ " : " − ");
}

/** Normalises the PostgREST shape (schedule is an array of 0-1 rows) into the Journey type. */
export function normalizeJourney(row: Record<string, unknown>): Journey {
  const schedules = row.schedule as JourneySchedule[] | JourneySchedule | null | undefined;
  return {
    ...(row as unknown as Journey),
    schedule: Array.isArray(schedules) ? schedules[0] ?? null : schedules ?? null,
  };
}

export const JOURNEY_SELECT = "*, schedule:comms_journey_schedules(*)";

// supabase.functions.invoke hides the response body on non-2xx; surface the function's own error text.
export async function invokeJourneyActions<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("comms-journey-actions", { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      const parsed = await ctx.json().catch(() => null);
      if (parsed?.error) message = parsed.error;
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
