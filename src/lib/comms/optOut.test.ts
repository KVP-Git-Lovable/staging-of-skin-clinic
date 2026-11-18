import { describe, expect, it } from "vitest";
import { optOutKey } from "./optOut";

describe("optOutKey", () => {
  it("matches the same person however the number is written", () => {
    expect(optOutKey("+91 98765-43210")).toBe("9876543210");
    expect(optOutKey("09876543210")).toBe("9876543210");
    expect(optOutKey("9876543210")).toBe("9876543210");
  });
  it("rejects numbers that are too short", () => {
    expect(optOutKey("12345")).toBeNull();
    expect(optOutKey(null)).toBeNull();
    expect(optOutKey("")).toBeNull();
  });
});
