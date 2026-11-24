import { describe, expect, it } from "vitest";
import { clampNumber, commitDraft, displayNumber, parseDraft } from "./numberField";

/**
 * The box that would not let go of its zero.
 *
 * Reported from Check-in policy: backspace on "Corrections allowed per month"
 * put the 0 straight back, and typing 3 after it gave 30. The cause is
 * Number("") === 0 on every keystroke, so the cleared box was re-filled
 * before the keystroke landed.
 */

describe("parseDraft", () => {
  it("accepts a number, zero and negatives included", () => {
    expect(parseDraft("0")).toEqual({ ok: true, value: 0 });
    expect(parseDraft("3")).toEqual({ ok: true, value: 3 });
    expect(parseDraft("0.5")).toEqual({ ok: true, value: 0.5 });
    expect(parseDraft("-3")).toEqual({ ok: true, value: -3 });
    expect(parseDraft(" 12 ")).toEqual({ ok: true, value: 12 });
  });

  it("refuses an empty box rather than calling it zero", () => {
    // This single line is the bug. Number("") is 0, so the old handler wrote
    // 0 the instant somebody cleared the field.
    expect(parseDraft("")).toEqual({ ok: false });
    expect(parseDraft("   ")).toEqual({ ok: false });
    expect(parseDraft(null)).toEqual({ ok: false });
    expect(parseDraft(undefined)).toEqual({ ok: false });
  });

  it("refuses the halfway states somebody types through", () => {
    // "-" on the way to "-3", "1." on the way to "1.5". Not values, not
    // mistakes - and destroying them is what makes a field fight back.
    expect(parseDraft("-")).toEqual({ ok: false });
    expect(parseDraft(".")).toEqual({ ok: false });
    expect(parseDraft("1.")).toEqual({ ok: false });
    expect(parseDraft("abc")).toEqual({ ok: false });
    expect(parseDraft("1e5")).toEqual({ ok: false });
  });
});

describe("clampNumber", () => {
  it("holds a figure inside its bounds", () => {
    // min and max on an <input type="number"> are a hint to the spinner;
    // typing or pasting past them is allowed. regularisation_monthly_limit
    // has a database CHECK of 0..31 behind it.
    expect(clampNumber(40, { min: 0, max: 31 })).toBe(31);
    expect(clampNumber(-5, { min: 0, max: 31 })).toBe(0);
    expect(clampNumber(3, { min: 0, max: 31 })).toBe(3);
  });

  it("leaves a figure alone when there is no bound that way", () => {
    expect(clampNumber(9999, { min: 0 })).toBe(9999);
    expect(clampNumber(-9999, { max: 10 })).toBe(-9999);
    expect(clampNumber(7)).toBe(7);
  });

  it("falls to the floor rather than passing NaN on", () => {
    expect(clampNumber(Number.NaN, { min: 1, max: 10 })).toBe(1);
    expect(clampNumber(Number.NaN)).toBe(0);
  });
});

describe("commitDraft", () => {
  it("settles an empty box on the value that was chosen for it", () => {
    // 0 for a limit where 0 means "no limit"; 75 for a threshold with a
    // documented default; this year for a year.
    expect(commitDraft("", { min: 0, max: 31, emptyValue: 0 })).toBe(0);
    expect(commitDraft("", { min: 0, max: 100, emptyValue: 75 })).toBe(75);
    expect(commitDraft("", { min: 2000, max: 2100, emptyValue: 2026 })).toBe(2026);
  });

  it("settles a halfway edit the same way", () => {
    expect(commitDraft("-", { min: 1, max: 10, emptyValue: 1 })).toBe(1);
    expect(commitDraft("1.", { min: 0, emptyValue: 0 })).toBe(0);
  });

  it("keeps a real figure, clamped", () => {
    expect(commitDraft("3", { min: 0, max: 31, emptyValue: 0 })).toBe(3);
    expect(commitDraft("99", { min: 0, max: 31, emptyValue: 0 })).toBe(31);
  });

  it("falls back to min, then to zero, when no empty value was given", () => {
    expect(commitDraft("", { min: 1, max: 10 })).toBe(1);
    expect(commitDraft("")).toBe(0);
  });
});

describe("displayNumber", () => {
  it("shows 0 as 0, which numVal deliberately does not", () => {
    // On these settings 0 is an answer somebody chose - "no limit" - not an
    // absent value to be hidden behind a placeholder.
    expect(displayNumber(0, null)).toBe("0");
    expect(displayNumber(31, null)).toBe("31");
  });

  it("shows the draft while there is one, empty included", () => {
    // The empty draft is the point: it is what the box looks like between
    // backspace and the next keystroke.
    expect(displayNumber(0, "")).toBe("");
    expect(displayNumber(12, "1")).toBe("1");
    expect(displayNumber(12, "-")).toBe("-");
  });

  it("shows nothing for a value that is not there", () => {
    expect(displayNumber(null, null)).toBe("");
    expect(displayNumber(undefined, null)).toBe("");
    expect(displayNumber(Number.NaN, null)).toBe("");
  });
});
