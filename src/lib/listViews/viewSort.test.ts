import { describe, it, expect } from "vitest";
import { resolveViewSort } from "./viewSort";
import { APPOINTMENT_VIEW_FIELDS } from "./appointmentFields";

const FALLBACK = { column: "start_time", direction: "asc" } as const;
const resolve = (field: string | null | undefined, dir?: "asc" | "desc" | null) =>
  resolveViewSort(field, dir, APPOINTMENT_VIEW_FIELDS, FALLBACK);

describe("resolveViewSort", () => {
  it("ignores created_at, which no list offers and nobody chose", () => {
    // The stored default on all seven appointment views. Applying it dragged
    // the stored "desc" onto start_time and put the evening at the top.
    expect(resolve("created_at", "desc")).toEqual(FALLBACK);
    expect(resolve("created_at", "asc")).toEqual(FALLBACK);
  });

  it("falls back when there is no field at all", () => {
    expect(resolve(null, "desc")).toEqual(FALLBACK);
    expect(resolve(undefined, "desc")).toEqual(FALLBACK);
    expect(resolve("", "desc")).toEqual(FALLBACK);
    expect(resolve("   ", "desc")).toEqual(FALLBACK);
  });

  it("ignores a field the list does not have", () => {
    expect(resolve("visit_status", "desc")).toEqual(FALLBACK);
    expect(resolve("nonsense", "asc")).toEqual(FALLBACK);
  });

  it("falls back to ascending, so the day reads morning to evening", () => {
    expect(resolve("created_at", "desc").direction).toBe("asc");
  });

  it("honours a sort someone actually picked, in either direction", () => {
    expect(resolve("start_time", "desc")).toEqual({ column: "start_time", direction: "desc" });
    expect(resolve("patient", "asc")).toEqual({ column: "patient", direction: "asc" });
    expect(resolve("bill", "desc")).toEqual({ column: "bill", direction: "desc" });
  });

  it("treats a missing direction on a real field as ascending", () => {
    expect(resolve("doctor", null)).toEqual({ column: "doctor", direction: "asc" });
    expect(resolve("doctor", undefined)).toEqual({ column: "doctor", direction: "asc" });
  });

  it("accepts every field the appointments list renders", () => {
    for (const f of APPOINTMENT_VIEW_FIELDS) {
      expect(resolve(f.key, "desc")).toEqual({ column: f.key, direction: "desc" });
    }
  });
});
