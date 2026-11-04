import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));

const getReport = async (key: string) => {
  const { REPORTS } = await import("./reportsCatalog");
  const report = REPORTS.find((r) => r.key === key);
  if (!report) throw new Error(`${key} report missing`);
  return report;
};

// Shaped like the rows the fetcher builds, with the flattened fields.
const rows = [
  { nps_score: 10, service_rating: 5, patient_name: "Josily Boban", phone: "9037877393", comments: null, appointment_id: "a1" },
  { nps_score: 8, service_rating: 4, patient_name: "Rakshith", phone: "8884965450", comments: "Quick and clear", appointment_id: "a2" },
  { nps_score: 5, service_rating: 2, patient_name: "Dr Honey", phone: "9995531176", comments: null, appointment_id: "a3" },
];

describe("Patient Feedback report", () => {
  it("sits under Patients", async () => {
    const report = await getReport("patient_feedback");
    expect(report.category).toBe("Patients");
    expect(report.title).toBe("Patient Feedback");
  });

  it("shows who left it, about which visit, and what they said", async () => {
    const keys = (await getReport("patient_feedback")).columns.map((c) => c.key);
    for (const k of ["patient_name", "phone", "doctor_name", "appointment_date", "investigation",
                     "nps_score", "nps_category", "service_rating", "comments", "created_at"]) {
      expect(keys).toContain(k);
    }
  });

  it("derives the NPS group and rating word through accessors, so they survive export", async () => {
    // render is screen-only; CSV and the PDF read accessor.
    const cols = (await getReport("patient_feedback")).columns;
    const group = cols.find((c) => c.key === "nps_category")!;
    const rating = cols.find((c) => c.key === "rating_label")!;
    expect(group.accessor).toBeTypeOf("function");
    expect(rating.accessor).toBeTypeOf("function");
    expect(group.accessor!(rows[0])).toBe("Promoter");
    expect(group.accessor!(rows[2])).toBe("Detractor");
    expect(rating.accessor!(rows[1])).toBe("Good");
    expect(cols.every((c) => !c.render)).toBe(true);
  });

  it("offers the filters asked for, on top of the shared date presets", async () => {
    const filters = (await getReport("patient_feedback")).filters;
    const byKey = Object.fromEntries(filters.map((f) => [f.key, f]));
    // Week/month/quarter/year come from the page's own preset list.
    expect(byKey.dateRange?.type).toBe("dateRange");
    expect(byKey.dateRange?.serverDateField).toBe("created_at");
    expect(byKey.doctor?.type).toBe("doctor");
    expect(byKey.nps_category?.options?.map((o) => o.value)).toEqual(["Promoter", "Passive", "Detractor"]);
    expect(byKey.service_rating?.options).toHaveLength(5);
    expect(byKey.has_comment?.options?.map((o) => o.value)).toEqual(["yes", "no"]);
  });

  it("summarises with the real NPS, not the average score", async () => {
    const cards = (await getReport("patient_feedback")).summary!(rows);
    const labels = cards.map((c) => c.label);
    expect(labels).toContain("Responses");
    expect(labels).toContain("NPS");
    expect(cards.find((c) => c.label === "Responses")!.value).toBe("3");
    // 1 promoter, 1 detractor of 3 -> 0, where the mean score would be 7.67.
    expect(cards.find((c) => c.label === "NPS")!.value).toBe("0");
  });

  it("says nothing rather than zero when there is no feedback yet", async () => {
    const cards = (await getReport("patient_feedback")).summary!([]);
    expect(cards.find((c) => c.label === "NPS")!.value).toBe("-");
  });

  it("charts the three groups", async () => {
    const chart = (await getReport("patient_feedback")).chart!;
    expect(chart.build(rows)).toEqual([
      { label: "Promoter", value: 1 },
      { label: "Passive", value: 1 },
      { label: "Detractor", value: 1 },
    ]);
  });

  it("opens the appointment the feedback was about", async () => {
    const href = (await getReport("patient_feedback")).rowHref!;
    expect(href(rows[0])).toBe("/appointments?appointmentDetail=a1");
    expect(href({ appointment_id: null })).toBeNull();
  });

  it("searches the things staff would type", async () => {
    const fields = (await getReport("patient_feedback")).searchFields!;
    expect(fields).toContain("patient_name");
    expect(fields).toContain("phone");
    expect(fields).toContain("comments");
  });
});
