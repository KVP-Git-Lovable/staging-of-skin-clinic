import { describe, it, expect } from "vitest";
import { joinDateTime, hasIncompleteDateTime } from "./inlineTimeEdit";

describe("joinDateTime", () => {
  it("joins a complete pair", () => {
    expect(joinDateTime("2026-09-29", "11:00")).toBe("2026-09-29T11:00");
  });

  it("refuses to invent an instant from half a pair", () => {
    expect(joinDateTime("2026-09-29", "")).toBe("");
    expect(joinDateTime("", "11:00")).toBe("");
    expect(joinDateTime("", "")).toBe("");
  });
});

describe("hasIncompleteDateTime", () => {
  it("catches a date typed with the time cleared - the reschedule that silently did not save", () => {
    expect(hasIncompleteDateTime({ start_time: "", end_time: "2026-09-29T11:15" })).toBe(true);
    expect(hasIncompleteDateTime({ start_time: "2026-09-29T11:00", end_time: "" })).toBe(true);
  });

  it("passes a complete pair", () => {
    expect(hasIncompleteDateTime({ start_time: "2026-09-29T11:00", end_time: "2026-09-29T11:15" })).toBe(false);
  });

  it("passes an edit that did not touch the times at all", () => {
    expect(hasIncompleteDateTime({})).toBe(false);
    expect(hasIncompleteDateTime({ start_time: undefined, end_time: undefined })).toBe(false);
  });
});
