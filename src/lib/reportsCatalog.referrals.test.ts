import { describe, it, expect, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({}) } }));

/**
 * The Doctor Referrals report.
 *
 * It exists because the Salesforce import brought the referral flag but not
 * the referring doctor's name: 152 patients say "Reference - other Dr" and
 * none of them says who. These hold the two things that would quietly make the
 * report wrong - picking rows by an exact spelling rather than by meaning, and
 * printing a patient's id in a column headed "Referring Doctor".
 */

const getReport = async (key: string) => {
  const { REPORTS } = await import("./reportsCatalog");
  const report = REPORTS.find((r) => r.key === key);
  if (!report) throw new Error(`${key} report missing`);
  return report;
};

const { referralKind } = await import("./patientReferral");
/** The rule the fetcher applies after narrowing in the database. */
const included = (source: string | null) => referralKind(source) === "doctor";

const col = async (key: string) => {
  const found = (await getReport("doctor_referrals")).columns.find((c) => c.key === key);
  if (!found) throw new Error(`${key} column missing`);
  return found;
};

describe("Doctor Referrals report", () => {
  it("sits under Patients", async () => {
    const report = await getReport("doctor_referrals");
    expect(report.category).toBe("Patients");
    expect(report.title).toBe("Doctor Referrals");
  });

  it("carries the Salesforce id, which is how a missing name gets looked up", async () => {
    const keys = (await getReport("doctor_referrals")).columns.map((c) => c.key);
    for (const k of ["name", "phone", "referring_doctor", "source", "total_visits",
                     "lifetime_value", "registered_at", "sf_id"]) {
      expect(keys).toContain(k);
    }
  });

  describe("which patients it counts as doctor-referred", () => {
    it("takes the Salesforce spelling, which is 152 of the 160", () => {
      expect(included("Reference - other Dr")).toBe(true);
    });

    it("takes the app's own spellings too", () => {
      expect(included("Dr. referral")).toBe(true);
      expect(included("Other Dr. referral")).toBe(true);
    });

    it("leaves out patient referrals, which are a different question", () => {
      expect(included("Reference - other patients")).toBe(false);
      expect(included("Referred by Patient")).toBe(false);
    });

    it("leaves out everyone else", () => {
      expect(included("Walk-in")).toBe(false);
      expect(included("Social media")).toBe(false);
      expect(included("")).toBe(false);
      expect(included(null)).toBe(false);
    });
  });

  describe("the Referring Doctor column", () => {
    it("shows the name when one was recorded", async () => {
      const c = await col("referring_doctor");
      expect(c.accessor!({ source_referral_doctor: "Dr. Gaurav Shetty" })).toBe("Dr. Gaurav Shetty");
    });

    it("stays blank for the 153 nobody recorded", async () => {
      const c = await col("referring_doctor");
      expect(c.accessor!({ source_referral_doctor: null })).toBe("");
      expect(c.accessor!({ source_referral_doctor: "" })).toBe("");
    });

    it("stays blank rather than printing a patient id stored in the same column", async () => {
      const c = await col("referring_doctor");
      expect(c.accessor!({ source_referral_doctor: "750735a9-e3e5-4064-ae0e-a7b7274b8402" })).toBe("");
    });
  });

  describe("the Doctor Name Recorded filter", () => {
    const named = { source_referral_doctor: "Dr.Jyothi" };
    const blank = { source_referral_doctor: null };
    const uuid = { source_referral_doctor: "750735a9-e3e5-4064-ae0e-a7b7274b8402" };

    it("splits recorded from not recorded", async () => {
      const f = (await getReport("doctor_referrals")).filters.find((x) => x.key === "named")!;
      expect(f.matches!(named, "yes")).toBe(true);
      expect(f.matches!(blank, "yes")).toBe(false);
      expect(f.matches!(blank, "no")).toBe(true);
      expect(f.matches!(named, "no")).toBe(false);
    });

    it("counts a patient id as not recorded, same as the column shows it", async () => {
      const f = (await getReport("doctor_referrals")).filters.find((x) => x.key === "named")!;
      expect(f.matches!(uuid, "no")).toBe(true);
      expect(f.matches!(uuid, "yes")).toBe(false);
    });
  });

  it("summarises how many have no doctor against them", async () => {
    const report = await getReport("doctor_referrals");
    const cards = report.summary!([
      { source_referral_doctor: "Dr.Jyothi", lifetime_value: 1000 },
      { source_referral_doctor: null, lifetime_value: 2000 },
      { source_referral_doctor: null, lifetime_value: 500 },
    ]);
    expect(cards[0].value).toBe("3");
    expect(cards[1].value).toBe("2");
  });
});

/**
 * The date this report is built on.
 *
 * The clinic went looking for 2023 referrals and found nothing before April
 * 2026. Every patient row in this database was CREATED by the Salesforce
 * migration on 22 April 2026, so a report dated by created_at starts there
 * and the clinic's first six years are invisible. registered_at is when the
 * patient actually registered - populated for all 27,624 of them, back to
 * August 2020.
 */
describe("Doctor Referrals is dated by when the patient registered", () => {
  it("never dates itself by the row's creation", async () => {
    const report = await getReport("doctor_referrals");
    expect(report.columns.map((c) => c.key)).not.toContain("created_at");
    expect(report.defaultSort?.key).toBe("registered_at");
  });

  it("filters the database on registered_at, not created_at", async () => {
    const report = await getReport("doctor_referrals");
    const range = report.filters?.find((f) => f.key === "dateRange");
    expect(range?.serverDateField).toBe("registered_at");
    // The label was always right; only the field it read was wrong.
    expect(range?.label).toBe("Registered");
  });
});
