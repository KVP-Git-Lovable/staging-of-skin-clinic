import { describe, it, expect } from "vitest";
import { procedureDate } from "../../supabase/functions/sf-import-clinical/procedureDate";

/**
 * A prescription showed up twice on Nisha's page (9036276451): once on 14 May,
 * the date of the visit, and again on 17 June wearing the same "1rx Peel B"
 * label. The 17 June row is a second Salesforce prescription saved against the
 * 14 May appointment; the import dated it by CreatedDate, the day it was typed.
 */

describe("procedureDate", () => {
  it("dates a prescription by the visit it is linked to, not the day it was typed", () => {
    // Nisha's case exactly: attended 14 May, written up 17 June.
    expect(procedureDate("2026-06-17T11:56:13.000+0000", "2026-05-14T11:30:00.000+0000"))
      .toBe("2026-05-14T11:30:00.000+0000");
  });

  it("falls back to the typed date when the prescription has no appointment", () => {
    expect(procedureDate("2026-06-17T11:56:13.000+0000", null)).toBe("2026-06-17T11:56:13.000+0000");
    expect(procedureDate("2026-06-17T11:56:13.000+0000")).toBe("2026-06-17T11:56:13.000+0000");
  });

  it("ignores a blank or unusable appointment date rather than writing one", () => {
    expect(procedureDate("2026-06-17T11:56:13.000+0000", "")).toBe("2026-06-17T11:56:13.000+0000");
    expect(procedureDate("2026-06-17T11:56:13.000+0000", "   ")).toBe("2026-06-17T11:56:13.000+0000");
    expect(procedureDate("2026-06-17T11:56:13.000+0000", "not a date")).toBe("2026-06-17T11:56:13.000+0000");
  });

  it("leaves the common case alone - same day, same answer", () => {
    const sameDay = "2026-05-06T11:47:31.000+0000";
    expect(procedureDate(sameDay, "2026-05-06T11:00:00.000+0000")).toBe("2026-05-06T11:00:00.000+0000");
  });

  it("returns null rather than undefined when there is no date at all", () => {
    expect(procedureDate(null, null)).toBeNull();
    expect(procedureDate(undefined)).toBeNull();
  });
});
