import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  caseDecision, decisionRowClass, decisionSummary, matchesDecisionFilter, needsDecision,
  RCA_FILTER_OPTIONS, RCA_NOT_REQUIRED_STATUS, RCA_REQUIRED_STATUS,
} from "./feedbackCaseDecision";
import { RCA_STATUSES, rcaStatusLabel } from "./feedbackRca";
import { getReport } from "./reportsCatalog";

/**
 * Which feedback still needs somebody to decide, and what the row looks like.
 *
 * The rule that matters: red means "this needs you today", not "this visit
 * went badly once". A decided row stops shouting.
 */

describe("what state a row is in", () => {
  it("has nothing to decide when the score was fine", () => {
    // No case means the database never judged this low enough.
    expect(caseDecision({ rca_case_id: null, rca_status: null })).toBe("none");
    expect(caseDecision({})).toBe("none");
    expect(caseDecision(null)).toBe("none");
    expect(caseDecision(undefined)).toBe("none");
  });

  it("needs a decision while the case is open", () => {
    expect(caseDecision({ rca_case_id: "c1", rca_status: "open" })).toBe("undecided");
    expect(needsDecision({ rca_case_id: "c1", rca_status: "open" })).toBe(true);
  });

  it("is decided once somebody has said anything else", () => {
    for (const status of ["in_progress", "resolved", "no_action"]) {
      expect(caseDecision({ rca_case_id: "c1", rca_status: status })).toBe("decided");
      expect(needsDecision({ rca_case_id: "c1", rca_status: status })).toBe(false);
    }
  });

  it("treats a case with no status as still needing one", () => {
    // Safer to ask again than to let one disappear quietly.
    expect(caseDecision({ rca_case_id: "c1", rca_status: null })).toBe("decided");
  });
});

describe("the red line", () => {
  it("marks only the rows still waiting", () => {
    expect(decisionRowClass({ rca_case_id: "c1", rca_status: "open" })).toContain("destructive");
  });

  it("lets a decided row look like every other row", () => {
    // The clinic has 1,224 feedback rows. If red survived the decision it
    // would stop meaning anything.
    for (const status of ["in_progress", "resolved", "no_action"]) {
      expect(decisionRowClass({ rca_case_id: "c1", rca_status: status })).toBe("");
    }
  });

  it("ignores a field that is not actually a case id", () => {
    // Every report's rows go through this, and they are whatever that
    // report's fetcher built. A value of the wrong shape is not a case.
    expect(decisionRowClass({ rca_case_id: 123, rca_status: "open" })).toBe("");
    expect(decisionRowClass({ rca_case_id: {}, rca_status: "open" })).toBe("");
    expect(decisionRowClass("a string row")).toBe("");
    // A real one still is.
    expect(decisionRowClass({ rca_case_id: "c1", rca_status: "open" })).toContain("destructive");
  });

  it("leaves every other report untouched", () => {
    // ReportView hands this to every report, so a row with no case field at
    // all must come back with no classes.
    expect(decisionRowClass({})).toBe("");
    expect(decisionRowClass(undefined)).toBe("");
  });
});

describe("what the exported sheet says", () => {
  it("names the decision still owed", () => {
    expect(decisionSummary({ rca_case_id: "c1", rca_status: "open" }, rcaStatusLabel))
      .toBe("Needs a decision");
  });

  it("names the decision taken, in the clinic's own words", () => {
    expect(decisionSummary({ rca_case_id: "c1", rca_status: "no_action" }, rcaStatusLabel))
      .toBe("No action needed");
    expect(decisionSummary({ rca_case_id: "c1", rca_status: "in_progress" }, rcaStatusLabel))
      .toBe("In progress");
  });

  it("says nothing for a score that was fine", () => {
    expect(decisionSummary({}, rcaStatusLabel)).toBe("");
  });
});

describe("the two answers are statuses the database already accepts", () => {
  it("ticking and crossing use the existing vocabulary", () => {
    // Nothing new to store, and nothing the Root Cause Analysis screen
    // cannot already set by hand.
    const values = RCA_STATUSES.map((s) => s.value);
    expect(values).toContain(RCA_REQUIRED_STATUS);
    expect(values).toContain(RCA_NOT_REQUIRED_STATUS);
    expect(RCA_REQUIRED_STATUS).not.toBe(RCA_NOT_REQUIRED_STATUS);
  });

  it("neither answer is 'open', or the row would never stop asking", () => {
    expect(RCA_REQUIRED_STATUS).not.toBe("open");
    expect(RCA_NOT_REQUIRED_STATUS).not.toBe("open");
  });
});

describe("the cell", () => {
  // Comments stripped: this file explains these very rules, and prose that
  // quotes the code would otherwise satisfy a test about the code.
  const cell = () =>
    readFileSync("src/components/feedback/RcaDecisionCell.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

  it("changes only the status, and deletes nothing", () => {
    // The case, its discussion and its history stay exactly as they are.
    const source = cell();
    expect(source).toContain('.from("feedback_rca")');
    expect(source).not.toMatch(/\.delete\(\)/);
    expect(source).toMatch(/\.update\(\{ status:/);
  });

  it("checks the save actually happened", () => {
    // A row-level refusal matches no rows rather than erroring, so without
    // this the clinic would be told it saved when nothing moved.
    const source = cell();
    expect(source).toContain('.select("id")');
    expect(source).toContain("if (!data?.length) throw");
  });

  it("does not let the buttons open the visit as well", () => {
    expect(cell()).toContain("onClick={(e) => e.stopPropagation()}");
  });

  it("gives both buttons a label somebody can hear", () => {
    const source = cell();
    expect(source).toContain('aria-label="Root cause analysis needed"');
    expect(source).toContain('aria-label="Root cause analysis not needed"');
  });
});

describe("filtering down to what needs doing", () => {
  const open = { rca_case_id: "c1", rca_status: "open" };
  const working = { rca_case_id: "c2", rca_status: "in_progress" };
  const resolved = { rca_case_id: "c3", rca_status: "resolved" };
  const waved = { rca_case_id: "c4", rca_status: "no_action" };
  const fine = { rca_case_id: null, rca_status: null };
  const all = [open, working, resolved, waved, fine];
  const kept = (value: string) => all.filter((r) => matchesDecisionFilter(r, value));

  it("shows only the rows still waiting, which is what was asked for", () => {
    expect(kept("needed")).toEqual([open]);
  });

  it("never counts a decided case as still needing one", () => {
    for (const row of [working, resolved, waved, fine]) {
      expect(matchesDecisionFilter(row, "needed")).toBe(false);
    }
  });

  it("picks out one status at a time", () => {
    expect(kept("in_progress")).toEqual([working]);
    expect(kept("resolved")).toEqual([resolved]);
    expect(kept("no_action")).toEqual([waved]);
  });

  it("shows every case, or none of them", () => {
    expect(kept("any")).toEqual([open, working, resolved, waved]);
    expect(kept("none")).toEqual([fine]);
    // Complements: between them they account for every row exactly once.
    expect(kept("any").length + kept("none").length).toBe(all.length);
  });

  it("matches nothing on a value it does not know", () => {
    // Matching everything would be worse than useless: the clinic would read
    // a full page of feedback as though all of it needed reviewing.
    expect(kept("made_up")).toEqual([]);
    expect(kept("")).toEqual([]);
  });

  it("does not mistake a stray field for a case", () => {
    // A status with no case id is not a case, whatever it says.
    expect(matchesDecisionFilter({ rca_status: "open" }, "needed")).toBe(false);
    // The status branch too: a row carrying a status but no case is not a case.
    expect(matchesDecisionFilter({ rca_status: "in_progress" }, "in_progress")).toBe(false);
    expect(matchesDecisionFilter({ rca_case_id: null, rca_status: "no_action" }, "no_action")).toBe(false);
    expect(matchesDecisionFilter({ rca_case_id: 7, rca_status: "open" }, "needed")).toBe(false);
    expect(matchesDecisionFilter("a string row", "any")).toBe(false);
  });

  it("offers the decision first, and names the statuses as the clinic does", () => {
    expect(RCA_FILTER_OPTIONS[0]).toEqual({ value: "needed", label: "Needs a decision" });
    // Derived from RCA_STATUSES, so a reworded label follows automatically.
    for (const status of RCA_STATUSES.filter((x) => x.value !== "open")) {
      expect(RCA_FILTER_OPTIONS).toContainEqual({ value: status.value, label: status.label });
    }
    // "open" is offered as "Needs a decision", never twice.
    expect(RCA_FILTER_OPTIONS.filter((o) => o.value === "open")).toEqual([]);
  });

  it("offers nothing the matcher cannot answer", () => {
    for (const option of RCA_FILTER_OPTIONS) {
      expect(all.some((r) => matchesDecisionFilter(r, option.value))).toBe(true);
    }
  });
});

describe("the report", () => {
  const catalog = () => readFileSync("src/lib/reportsCatalog.ts", "utf8");

  it("is derived from the existing feedback report, not copied", () => {
    // Copied columns drift, and then the two screens disagree about the
    // clinic's own numbers.
    const source = catalog();
    expect(source).toContain('const feedbackReport = BASE_REPORTS.find((r) => r.key === "patient_feedback")');
    expect(source).toContain("...feedbackReport,");
    expect(source).toContain("...feedbackReport.columns,");
  });

  it("adds the decision as the last column", () => {
    const source = catalog();
    const added = source.slice(source.indexOf("...feedbackReport.columns,"));
    expect(added).toContain('key: "rca_decision"');
    expect(added).toContain("accessor:");
  });

  it("keeps the Reports catalogue exactly as it was", () => {
    // Two tiles for the same thing is how a clinic ends up with two numbers.
    expect(catalog()).toContain("hidden: true,");
    expect(readFileSync("src/pages/Reports.tsx", "utf8")).toContain("&& !r.hidden");
  });

  it("appends the RCA filter rather than replacing the existing ones", () => {
    const source = catalog();
    expect(source).toContain("...feedbackReport.filters,");
    expect(source).toContain("matches: matchesDecisionFilter,");
  });

  it("leaves the original report's own filters alone", () => {
    // Not a source guard: the two definitions are read and compared, so a
    // spread accidentally turned into a push would fail here.
    const original = getReport("patient_feedback")!;
    const derived = getReport("all_feedbacks")!;
    expect(original.filters.map((f) => f.key)).not.toContain("rca");
    expect(derived.filters.map((f) => f.key)).toEqual([...original.filters.map((f) => f.key), "rca"]);
    expect(derived.columns.map((c) => c.key)).toEqual([...original.columns.map((c) => c.key), "rca_decision"]);
  });

  it("still offers the original report untouched", () => {
    const source = catalog();
    expect(source).toContain('key: "patient_feedback"');
    expect(source).toContain("export const REPORTS: ReportConfig[] = [...BASE_REPORTS, allFeedbacks];");
  });
});
