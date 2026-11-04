import { describe, it, expect } from "vitest";
import {
  soqlDateTime,
  recentTargetQueries,
  mergePatientIds,
} from "../../supabase/functions/sf-import-clinical/recentTargets";

const FROM = "2026-09-11T00:00:00Z";
const TO = "2026-09-11T23:59:59Z";
const queries = recentTargetQueries(FROM, TO);

describe("soqlDateTime", () => {
  it("drops milliseconds, which SOQL rejects", () => {
    expect(soqlDateTime("2026-09-11T10:30:00.123Z")).toBe("2026-09-11T10:30:00Z");
  });

  it("leaves no quotes around the literal - SOQL datetimes are unquoted", () => {
    expect(soqlDateTime(new Date(FROM))).not.toMatch(/['"]/);
  });

  it("refuses a date it cannot parse rather than building a broken query", () => {
    expect(() => soqlDateTime("not a date")).toThrow(/Invalid datetime/);
  });
});

describe("recentTargetQueries", () => {
  it("asks Billing__c directly - the whole point of the change", () => {
    const billing = queries.filter((q) => q.includes("FROM Billing__c"));
    expect(billing).toHaveLength(1);
    expect(billing[0]).toContain("CreatedDate >= 2026-09-11T00:00:00Z");
    expect(billing[0]).toContain("CreatedDate <= 2026-09-11T23:59:59Z");
  });

  it("still asks for appointments by start time, so nothing that worked stops working", () => {
    expect(queries.some((q) => q.includes("Start_Time__c >= 2026-09-11T00:00:00Z"))).toBe(true);
  });

  it("covers appointments with no start time, which a range filter drops", () => {
    const nullStart = queries.filter((q) => q.includes("Start_Time__c = null"));
    expect(nullStart).toHaveLength(1);
    // Those rows can only be placed by CreatedDate - the importer times them
    // from it too.
    expect(nullStart[0]).toContain("CreatedDate >=");
  });

  it("only ever selects the patient, and never one with no patient", () => {
    for (const q of queries) {
      expect(q.startsWith("SELECT Patient__c FROM ")).toBe(true);
      expect(q).toContain("Patient__c != null");
    }
  });

  it("quotes no datetime literal anywhere", () => {
    for (const q of queries) expect(q).not.toMatch(/['"]/);
  });
});

describe("mergePatientIds", () => {
  it("returns a patient once even when several sources report them", () => {
    expect(
      mergePatientIds([
        [{ Patient__c: "a1" }, { Patient__c: "b2" }],
        [{ Patient__c: "b2" }],
        [{ Patient__c: "c3" }, { Patient__c: "a1" }],
      ]),
    ).toEqual(["a1", "b2", "c3"]);
  });

  it("keeps first-seen order, because the caller pages this list by offset", () => {
    // A set that reordered between HTTP calls would skip or repeat patients.
    const first = mergePatientIds([[{ Patient__c: "z" }], [{ Patient__c: "a" }]]);
    expect(first).toEqual(["z", "a"]);
  });

  it("drops rows with no usable patient id instead of inventing one", () => {
    expect(
      mergePatientIds([[{ Patient__c: null }, { Patient__c: "" }, { Patient__c: "  " }, {}, { Patient__c: "ok" }]]),
    ).toEqual(["ok"]);
  });

  it("finds a billing-only patient that the appointment query cannot see", () => {
    // The reported bug: billed on the 11th, seen on another day. The first
    // query returns nothing for them; the billing query is what saves it.
    const byAppointment: Array<{ Patient__c?: unknown }> = [];
    const byBilling = [{ Patient__c: "sristi" }];
    expect(mergePatientIds([byAppointment, [], byBilling])).toEqual(["sristi"]);
  });

  it("is empty when every source is", () => {
    expect(mergePatientIds([[], [], []])).toEqual([]);
  });
});
