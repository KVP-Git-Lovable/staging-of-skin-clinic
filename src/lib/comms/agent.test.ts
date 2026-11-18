import { describe, expect, it } from "vitest";
import { formatIstStart } from "./agent";

describe("formatIstStart", () => {
  it("shows the IST wall-clock time as written", () => {
    expect(formatIstStart("2026-11-23T10:00")).toBe("Mon, 23 Nov 2026, 10:00 IST");
  });
  it("returns unrecognised text unchanged", () => {
    expect(formatIstStart("next monday")).toBe("next monday");
  });
});
