import { describe, it, expect } from "vitest";
import {
  BAR_CHART_MIN_HEIGHT,
  BAR_LABEL_CHARS,
  horizontalBarHeight,
  truncateLabel,
} from "./barChartLayout";

// Real service names, as the Salesforce import stores them.
const LONG = "Old Consult + 1RX Hydracleanup + Laser toning B";
const LONGEST = "Review + 2rx Upperlip + Chin HR + Mole removal touch up + Electrolysis";

describe("horizontalBarHeight", () => {
  it("gives every row more than one line of text", () => {
    // The bug: ten rows in a fixed 220px box is 22px each, so an 11px label
    // that wraps to two lines lands on its neighbours.
    const ten = horizontalBarHeight(10);
    expect(ten / 10).toBeGreaterThan(24);
    expect(ten).toBeGreaterThan(BAR_CHART_MIN_HEIGHT);
  });

  it("keeps the old height for a chart with only a few rows", () => {
    expect(horizontalBarHeight(1)).toBe(BAR_CHART_MIN_HEIGHT);
    expect(horizontalBarHeight(5)).toBe(BAR_CHART_MIN_HEIGHT);
  });

  it("grows one band at a time past the floor", () => {
    expect(horizontalBarHeight(10) - horizontalBarHeight(9)).toBe(30);
  });

  it("does not collapse on a chart with no data", () => {
    expect(horizontalBarHeight(0)).toBe(BAR_CHART_MIN_HEIGHT);
    expect(horizontalBarHeight(-3)).toBe(BAR_CHART_MIN_HEIGHT);
    expect(horizontalBarHeight(NaN)).toBe(BAR_CHART_MIN_HEIGHT);
  });
});

describe("truncateLabel", () => {
  it("leaves a name that already fits completely alone", () => {
    expect(truncateLabel("Consultation", BAR_LABEL_CHARS.desktop)).toBe("Consultation");
    expect(truncateLabel("4rx Laser Toning A", BAR_LABEL_CHARS.desktop)).toBe("4rx Laser Toning A");
  });

  it("cuts a long clinical name down and says it did", () => {
    // Asserted by shape, not against a literal: the character limit is tuned
    // against the rendered font, and a test that pins the exact string breaks
    // on that tuning without anything being wrong.
    const out = truncateLabel(LONG, BAR_LABEL_CHARS.desktop);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual(BAR_LABEL_CHARS.desktop);
    expect(LONG.startsWith(out.slice(0, -1))).toBe(true);
    expect(out).toMatch(/^Old Consult \+ 1RX/);
  });

  it("never returns more characters than it was given room for", () => {
    for (const label of [LONG, LONGEST, "x".repeat(200)]) {
      for (const max of [BAR_LABEL_CHARS.mobile, BAR_LABEL_CHARS.desktop]) {
        expect(truncateLabel(label, max).length, `${label} @ ${max}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it("does not leave a space stranded before the ellipsis", () => {
    expect(truncateLabel("Underarms HR Session Nine", 14)).toBe("Underarms HR…");
  });

  it("copes with nothing to show", () => {
    expect(truncateLabel("", 24)).toBe("");
    expect(truncateLabel(null, 24)).toBe("");
    expect(truncateLabel(undefined, 24)).toBe("");
    expect(truncateLabel("  Consultation  ", 24)).toBe("Consultation");
  });

  it("does not throw on an absurd width", () => {
    expect(truncateLabel(LONG, 1)).toBe("…");
    expect(truncateLabel(LONG, 0)).toBe("…");
  });
});
