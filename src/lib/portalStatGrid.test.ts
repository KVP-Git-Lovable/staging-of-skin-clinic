import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { statCardSpan } from "./portalStatGrid";

/** The spans for a whole row, which is how the grid actually uses this. */
const row = (count: number) =>
  Array.from({ length: count }, (_, i) => statCardSpan(i, count));

describe("statCardSpan", () => {
  it("leaves an even row alone", () => {
    expect(row(2)).toEqual(["", ""]);
    expect(row(4)).toEqual(["", "", "", ""]);
    expect(row(6)).toEqual(["", "", "", "", "", ""]);
  });

  it("stretches the last card of an odd row", () => {
    // Three cards is what the clinic is looking at: Appointments, Outstanding
    // Balance, Total Procedures, with Clinical Photos switched off.
    expect(row(3)).toEqual(["", "", "col-span-2"]);
    expect(row(5)).toEqual(["", "", "", "", "col-span-2"]);
    expect(row(1)).toEqual(["col-span-2"]);
  });

  it("never leaves an empty cell, at any count", () => {
    // The property that matters: cells used must be a multiple of the two
    // columns, so the last row is always full.
    for (let count = 1; count <= 12; count++) {
      const cells = row(count).reduce((n, c) => n + (c === "col-span-2" ? 2 : 1), 0);
      expect(cells % 2, `${count} cards leaves a hole`).toBe(0);
    }
  });

  it("stretches at most one card", () => {
    for (let count = 1; count <= 12; count++) {
      expect(row(count).filter((c) => c === "col-span-2").length).toBeLessThanOrEqual(1);
    }
  });

  it("returns nothing for an index outside the row", () => {
    expect(statCardSpan(3, 3)).toBe("");
    expect(statCardSpan(-1, 3)).toBe("");
    expect(statCardSpan(0, 0)).toBe("");
    expect(statCardSpan(1.5, 3)).toBe("");
    expect(statCardSpan(0, Number.NaN)).toBe("");
  });

  it("spells the class out, so Tailwind emits it", () => {
    // An interpolated col-span-${n} compiles but never ships the CSS.
    // Comments are stripped rather than matched around: the file's own
    // docstring names the interpolated form to explain why it is wrong.
    const code = readFileSync("src/lib/portalStatGrid.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).toContain('"col-span-2"');
    expect(code, "the span class is built by interpolation").not.toMatch(
      /col-span-\$\{/,
    );
  });
});

/**
 * The home screen itself. Portal.tsx is a 1,000-line component with no
 * exported seam, so these read the source - the same approach as
 * portalModules.test.ts.
 */
describe("the portal home stat grid", () => {
  const portal = () => readFileSync("src/pages/portal/Portal.tsx", "utf8");

  /** The statCards array literal, bounded by the line that filters it. */
  const cardList = () => {
    const page = portal();
    const from = page.indexOf("const statCards");
    const to = page.indexOf("const visibleStatCards");
    expect(from, "the home screen no longer builds a statCards list").toBeGreaterThan(-1);
    expect(to, "nothing filters statCards by its show flag").toBeGreaterThan(from);
    return page.slice(from, to);
  };

  it("renders from a list rather than hard-coded tiles", () => {
    const page = portal();
    expect(page).toMatch(/visibleStatCards\.map\(/);
  });

  it("actually applies the span to every card it renders", () => {
    // Importing the helper is not the same as using its result. The grid
    // computes the span once per card and must interpolate it into BOTH
    // className templates - the tappable tile and the plain one - or an odd
    // row still leaves a hole.
    const page = portal();
    const grid = page.slice(
      page.indexOf("{visibleStatCards.map("),
      page.indexOf("{/* Quick actions */}"),
    );
    expect(grid, "the grid does not call statCardSpan").toMatch(
      /statCardSpan\(i, visibleStatCards\.length\)/,
    );
    const applied = grid.match(/\$\{span\}/g) ?? [];
    expect(applied.length, "the computed span is not applied to both card shapes").toBe(2);
  });

  it("shows a Surveys card, behind the Surveys module", () => {
    const cards = cardList();
    expect(cards, "no Surveys card").toMatch(/Surveys to Fill/);
    expect(cards, "the Surveys card is not gated on surveysEnabled").toMatch(
      /show: surveysEnabled/,
    );
  });

  it("does not fetch the surveys when the module is off", () => {
    // Hiding the tile is not enough: an ungated query would still call
    // portal-data on every home load for a module the clinic switched off.
    expect(portal()).toMatch(/enabled: !!patientId && surveysEnabled/);
  });

  it("keeps the other four tiles behind the flags they already had", () => {
    const cards = cardList();
    expect(cards).toMatch(/show: outstandingBalanceEnabled/);
    expect(cards).toMatch(/show: clinicalPhotosEnabled/);
  });

  it("takes the patient to the Surveys tab, and fixes the URL too", () => {
    // The Quick Actions buttons call setActiveTab without navigating, which
    // leaves the address bar on the previous tab.
    const cards = cardList();
    expect(cards).toMatch(/setActiveTab\("surveys"\)/);
    expect(cards).toMatch(/navigate\("\/portal\/surveys"\)/);
  });

  it("shares one fetch with the Surveys tab's own list", () => {
    // Same query key as PortalSurveysList, so React Query serves both from
    // one cache entry and the existing post-submit invalidation refreshes
    // the card for free.
    const page = portal();
    expect((page.match(/"portal-assigned-surveys", patientId/g) ?? []).length).toBe(2);
  });
});
