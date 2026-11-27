// Pure helpers for the journey's Members tab: one row per enrolled patient with the state of the
// last message they were sent and whether they have written back since the journey first messaged them.
import type { CanvasData } from "@/lib/comms/journeyGraph";

export type MessageState = "read" | "delivered" | "sent" | "failed" | "skipped" | "queued" | "none";
export type MemberFilter = "all" | "sent" | "delivered" | "read" | "failed" | "replied" | "not_sent";

export const MEMBER_FILTERS: { value: MemberFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sent", label: "Sent" },
  { value: "delivered", label: "Delivered" },
  { value: "read", label: "Read" },
  { value: "failed", label: "Failed" },
  { value: "replied", label: "Replied" },
  { value: "not_sent", label: "Not sent yet" },
];

export interface EnrollmentRow {
  id: string;
  patient_id: string;
  status: string;
  current_node_id: string | null;
  enrolled_at: string;
  patients: { first_name: string | null; last_name: string | null; phone: string | null } | null;
}
export interface MemberLogRow {
  enrollment_id: string | null;
  channel: string;
  status: string;
  delivery_status: string | null;
  sent_at: string;
}
export interface InboundRow { phone: string; created_at: string }

export interface Member {
  id: string;
  name: string;
  phone: string;
  enrolledAt: string;
  status: string;
  currentStep: string;
  lastMessage: MessageState;
  lastMessageAt: string | null;
  replied: boolean;
}

const last10 = (raw: string | null | undefined): string => String(raw ?? "").replace(/\D/g, "").slice(-10);

/** The furthest state Twilio reported for one message row. */
export function messageState(row: Pick<MemberLogRow, "status" | "delivery_status">): MessageState {
  const values = [row.delivery_status, row.status].map((v) => String(v ?? "").toLowerCase());
  if (values.includes("read")) return "read";
  if (values.includes("failed") || values.includes("undelivered")) return "failed";
  if (values.includes("delivered")) return "delivered";
  if (values.includes("sent")) return "sent";
  if (values.includes("skipped")) return "skipped";
  return "queued";
}

export function stepLabel(canvas: CanvasData, nodeId: string | null): string {
  if (!nodeId) return "—";
  const node = canvas.nodes.find((n) => n.id === nodeId);
  if (!node) return "Removed step";
  return node.data.label || node.data.template_name || node.type.charAt(0).toUpperCase() + node.type.slice(1);
}

export function buildMembers(enrollments: EnrollmentRow[], logs: MemberLogRow[], inbound: InboundRow[], canvas: CanvasData): Member[] {
  const byEnrollment = new Map<string, MemberLogRow[]>();
  for (const l of logs) {
    if (!l.enrollment_id || l.channel !== "whatsapp") continue;
    const list = byEnrollment.get(l.enrollment_id);
    if (list) list.push(l);
    else byEnrollment.set(l.enrollment_id, [l]);
  }
  const latestReply = new Map<string, number>();
  for (const r of inbound) {
    const key = last10(r.phone);
    const at = Date.parse(r.created_at);
    if (key.length === 10 && at > (latestReply.get(key) ?? 0)) latestReply.set(key, at);
  }

  return enrollments.map((e) => {
    const rows = (byEnrollment.get(e.id) ?? []).slice().sort((a, b) => Date.parse(a.sent_at) - Date.parse(b.sent_at));
    const last = rows[rows.length - 1];
    // Only a message that actually left can be replied to.
    const firstSent = rows.find((r) => !["skipped", "queued"].includes(messageState(r)));
    const phone = e.patients?.phone ?? "";
    const key = last10(phone);
    const replyAt = key.length === 10 ? latestReply.get(key) : undefined;
    return {
      id: e.id,
      name: `${e.patients?.first_name ?? ""} ${e.patients?.last_name ?? ""}`.trim() || "—",
      phone,
      enrolledAt: e.enrolled_at,
      status: e.status,
      currentStep: e.status === "completed" ? "Finished" : stepLabel(canvas, e.current_node_id),
      lastMessage: last ? messageState(last) : "none",
      lastMessageAt: last?.sent_at ?? null,
      replied: !!firstSent && replyAt !== undefined && replyAt >= Date.parse(firstSent.sent_at),
    };
  });
}

export function matchesFilter(m: Member, f: MemberFilter): boolean {
  switch (f) {
    case "sent": return ["sent", "delivered", "read"].includes(m.lastMessage);
    case "delivered": return ["delivered", "read"].includes(m.lastMessage);
    case "read": return m.lastMessage === "read";
    case "failed": return m.lastMessage === "failed";
    case "replied": return m.replied;
    case "not_sent": return ["none", "queued", "skipped"].includes(m.lastMessage);
    default: return true;
  }
}

export function searchMembers(members: Member[], term: string, filter: MemberFilter): Member[] {
  const q = term.trim().toLowerCase();
  // Only a search that looks like a number is matched against phones ("name2" is a name).
  const digits = /^[\d\s+()-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  return members.filter(
    (m) => matchesFilter(m, filter) && (!q || m.name.toLowerCase().includes(q) || (!!digits && m.phone.replace(/\D/g, "").includes(digits))),
  );
}
