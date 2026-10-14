import { describe, expect, it } from "vitest";
import { applyFilters, type FieldDef } from "@/lib/listViews/engine";

const fields: FieldDef[] = [
  { key: "date_of_birth", label: "Date of Birth (Birthday)", type: "date", anniversary: true },
  { key: "created_at", label: "Created", type: "date" },
];

const rows = [
  { n: "born 1990", date_of_birth: "1990-05-20", created_at: "1990-05-20" },
  { n: "born 1985", date_of_birth: "1985-11-02", created_at: "1985-11-02" },
  { n: "born 2000", date_of_birth: "2000-03-10", created_at: "2000-03-10" },
  { n: "on cutoff", date_of_birth: "1995-01-01", created_at: "1995-01-01" },
  { n: "no dob", date_of_birth: null, created_at: null },
];

const run = (field: string, operator: string, value?: string) =>
  applyFilters(rows, { match: "all", conditions: [{ field, operator, value }] }, fields).map((r) => r.n);

describe("before / after on a birthday field use the real date of birth", () => {
  it("before 1995-01-01 keeps earlier births only", () => {
    expect(run("date_of_birth", "before", "1995-01-01")).toEqual(["born 1990", "born 1985"]);
  });
  it("after 1995-01-01 keeps later births only", () => {
    expect(run("date_of_birth", "after", "1995-01-01")).toEqual(["born 2000"]);
  });
  it("matches a normal date field the same way", () => {
    expect(run("created_at", "before", "1995-01-01")).toEqual(["born 1990", "born 1985"]);
  });
});

describe("birthday presets still ignore the year", () => {
  it("matches a birthday this month even when born years ago", () => {
    const now = new Date();
    const dob = `1980-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const result = applyFilters(
      [{ n: "birthday this month", date_of_birth: dob }],
      { match: "all", conditions: [{ field: "date_of_birth", operator: "this_month", value: "" }] },
      fields,
    ).map((r) => r.n);
    expect(result).toContain("birthday this month");
  });
});
