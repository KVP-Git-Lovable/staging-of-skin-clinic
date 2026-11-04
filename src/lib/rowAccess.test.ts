import { describe, it, expect } from "vitest";
import {
  NOT_YOURS_MESSAGE,
  assertWrote,
  isRowHidden,
  writeErrorMessage,
} from "./rowAccess";

describe("assertWrote", () => {
  it("passes a write that actually changed something", () => {
    expect(assertWrote([{ id: "a" }])).toEqual([{ id: "a" }]);
  });

  it("throws when RLS filtered the row out", () => {
    // The bug: Postgres reports zero rows and no error, so the app showed
    // "Updated" for a change that never happened - and sent the patient a
    // WhatsApp message about it.
    expect(() => assertWrote([])).toThrow(NOT_YOURS_MESSAGE);
    expect(() => assertWrote(null)).toThrow(NOT_YOURS_MESSAGE);
    expect(() => assertWrote(undefined)).toThrow(NOT_YOURS_MESSAGE);
  });
});

describe("isRowHidden", () => {
  it("recognises PostgREST's no-row code", () => {
    expect(isRowHidden({ code: "PGRST116" })).toBe(true);
  });

  it("does not claim every error is an access problem", () => {
    expect(isRowHidden({ code: "23505" })).toBe(false);
    expect(isRowHidden(new Error("network"))).toBe(false);
    expect(isRowHidden(null)).toBe(false);
    expect(isRowHidden(undefined)).toBe(false);
  });
});

describe("writeErrorMessage", () => {
  it("translates the row-hidden case into something a clinician can act on", () => {
    expect(
      writeErrorMessage({ code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" }),
    ).toBe(NOT_YOURS_MESSAGE);
  });

  it("leaves a real error alone rather than papering over it", () => {
    expect(writeErrorMessage({ message: "duplicate key value violates unique constraint" }))
      .toBe("duplicate key value violates unique constraint");
  });

  it("always returns something printable", () => {
    expect(writeErrorMessage(null)).toBe("Something went wrong.");
    expect(writeErrorMessage({})).toBe("Something went wrong.");
  });
});
