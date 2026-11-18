import { supabase } from "@/integrations/supabase/client";
import type { FilterCondition } from "@/lib/listViews/engine";

export type CheckLevel = "ok" | "warn" | "bad" | "info";
export interface AgentCheck { level: CheckLevel; message: string }

export interface JourneyPlan {
  kind: "journey";
  journey_name: string;
  filters_text: string[];
  template: { id: string; name: string; category: string; status: string; body: string; variable_map: Record<string, string> | null } | null;
  template_name: string;
  start_iso: string;
  start_label: string;
  audience: { matching: number; reachable: number; without_phone: number; opted_out: number };
  sample: string[];
  cost_estimate: number;
  checks: AgentCheck[];
  blocked: boolean;
  needs_second_confirmation: boolean;
}
export interface MetaPlan {
  kind: "meta";
  campaign_name: string;
  service: string;
  city: string;
  objective: string;
  daily_budget_inr: number;
  checks: AgentCheck[];
  blocked: boolean;
}
export interface QuestionPlan { kind: "question"; question: string }
export type AgentPlan = JourneyPlan | MetaPlan | QuestionPlan;

export interface ToolCall { name: string; args: Record<string, unknown>; result?: unknown; error?: string }
export interface PlanResponse { run_id: string; plan: AgentPlan; tool_calls: ToolCall[] }
export interface ApproveResponse { ok: true; kind: "journey" | "meta"; journey_id?: string; campaign_id?: string; view_id?: string }

export interface AgentSettings {
  audience_cap: number;
  send_window_start: number;
  send_window_end: number;
  ad_spend_cap: number;
  cost_per_message: number;
}
export const DEFAULT_AGENT_SETTINGS: AgentSettings = { audience_cap: 1000, send_window_start: 9, send_window_end: 21, ad_spend_cap: 1500, cost_per_message: 0.85 };

// supabase.functions.invoke hides the response body on non-2xx; surface the function's own error text.
export async function invokeAgent<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke("comms-agent", { body });
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

export const planPrompt = (prompt: string, base_filters: FilterCondition[]) =>
  invokeAgent<PlanResponse>({ action: "plan", prompt, base_filters });
export const approveRun = (run_id: string, confirm_over_cap = false) =>
  invokeAgent<ApproveResponse>({ action: "approve", run_id, confirm_over_cap });
export const rejectRun = (run_id: string) => invokeAgent<{ ok: true }>({ action: "reject", run_id });
export const saveAgentSettings = (s: AgentSettings) => invokeAgent<{ ok: true }>({ action: "save-settings", ...s });

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-11-23T10:00" -> "Mon, 23 Nov 2026, 10:00 IST" (the value is already IST wall-clock, so no zone conversion). */
export function formatIstStart(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return `${WEEKDAYS[d.getUTCDay()]}, ${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}, ${m[4]}:${m[5]} IST`;
}
