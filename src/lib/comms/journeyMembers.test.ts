import { describe, expect, it } from "vitest";
import { buildMembers, messageState, searchMembers, type EnrollmentRow, type MemberLogRow } from "./journeyMembers";
import type { CanvasData } from "./journeyGraph";

const canvas: CanvasData = {
  nodes: [
    { id: "entry", type: "entry", position: { x: 0, y: 0 }, data: {} },
    { id: "m1", type: "message", position: { x: 0, y: 1 }, data: { template_name: "skin_offer" } },
  ],
  edges: [],
};
const enrol = (id: string, phone: string | null, extra: Partial<EnrollmentRow> = {}): EnrollmentRow => ({
  id, patient_id: `p-${id}`, status: "active", current_node_id: "m1", enrolled_at: "2026-11-01T04:00:00Z",
  patients: { first_name: `Name${id}`, last_name: null, phone }, ...extra,
});
const log = (enrollment_id: string, status: string, sent_at: string, delivery_status: string | null = null): MemberLogRow => ({
  enrollment_id, channel: "whatsapp", status, delivery_status, sent_at,
});

describe("messageState", () => {
  it("takes the furthest state reported", () => {
    expect(messageState({ status: "delivered", delivery_status: "read" })).toBe("read");
    expect(messageState({ status: "sent", delivery_status: "undelivered" })).toBe("failed");
    expect(messageState({ status: "sent", delivery_status: null })).toBe("sent");
    expect(messageState({ status: "skipped", delivery_status: null })).toBe("skipped");
    expect(messageState({ status: "queued", delivery_status: null })).toBe("queued");
  });
});

describe("buildMembers", () => {
  const members = buildMembers(
    [enrol("1", "+91 98765 43210"), enrol("2", "9800000002"), enrol("3", "9800000003", { status: "completed" })],
    [
      log("1", "sent", "2026-11-02T05:00:00Z"),
      log("1", "delivered", "2026-11-03T05:00:00Z", "read"),
      log("2", "failed", "2026-11-02T05:00:00Z"),
    ],
    [
      { phone: "+919876543210", created_at: "2026-11-02T06:00:00Z" },
      { phone: "+919800000002", created_at: "2026-11-01T06:00:00Z" },
      { phone: "+919800000003", created_at: "2026-11-05T06:00:00Z" },
    ],
    canvas,
  );

  it("uses the latest message and the step the patient is on", () => {
    expect(members[0]).toMatchObject({ lastMessage: "read", currentStep: "skin_offer", name: "Name1" });
    expect(members[1].lastMessage).toBe("failed");
    expect(members[2]).toMatchObject({ lastMessage: "none", currentStep: "Finished" });
  });

  it("counts a reply only when it arrived after the first message was sent", () => {
    expect(members.map((m) => m.replied)).toEqual([true, false, false]);
  });

  it("filters and searches by name or phone", () => {
    expect(searchMembers(members, "", "read").map((m) => m.id)).toEqual(["1"]);
    expect(searchMembers(members, "", "failed").map((m) => m.id)).toEqual(["2"]);
    expect(searchMembers(members, "", "replied").map((m) => m.id)).toEqual(["1"]);
    expect(searchMembers(members, "", "not_sent").map((m) => m.id)).toEqual(["3"]);
    expect(searchMembers(members, "name2", "all").map((m) => m.id)).toEqual(["2"]);
    expect(searchMembers(members, "00003", "all").map((m) => m.id)).toEqual(["3"]);
  });
});
