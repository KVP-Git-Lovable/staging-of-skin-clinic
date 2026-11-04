import { describe, it, expect } from "vitest";
import { rescheduleVerdict, rescheduleWarning } from "./appointmentReschedule";

const SEP_25 = new Date(2026, 8, 25, 12, 45).toISOString();
const OCT_2 = new Date(2026, 9, 2, 12, 45).toISOString();
const OCT_8 = new Date(2026, 9, 8, 12, 45).toISOString();
const BILLED = { hasInvoice: true };

describe("rescheduleVerdict", () => {
  it("asks before writing next week's booking over last week's visit", () => {
    // Tahniya: seen 25 Sep, billed ₹3,000, moved to 2 Oct without a word.
    expect(rescheduleVerdict({ start_time: SEP_25 }, OCT_2, BILLED)).toBe("confirm");
  });

  it("asks when the visit has clinical notes rather than a bill", () => {
    expect(rescheduleVerdict({ start_time: SEP_25 }, OCT_2, { hasProcedure: true })).toBe("confirm");
  });

  it("lets a booking with nothing recorded against it move, which is the ordinary case", () => {
    expect(rescheduleVerdict({ start_time: OCT_2 }, OCT_8, {})).toBe("allow");
  });

  it("asks even before the slot time, because the clinic sees people early", () => {
    // Alister Moras: seen and prescribed at 11:07, and at 11:09 the date on
    // that appointment was moved to November - still an hour before the 12:15
    // it was booked for. The clock said "future booking"; the notes said a
    // consultation had happened.
    const seenEarly = new Date(2026, 9, 1, 12, 15).toISOString(); // later today
    expect(rescheduleVerdict({ start_time: seenEarly }, OCT_8, { hasProcedure: true })).toBe("confirm");
  });

  it("lets the time of a past visit be corrected on its own day", () => {
    const sameDayLater = new Date(2026, 8, 25, 17, 0).toISOString();
    expect(rescheduleVerdict({ start_time: SEP_25 }, sameDayLater, BILLED)).toBe("allow");
  });

  it("lets a past slot nobody turned up to be reused", () => {
    expect(rescheduleVerdict({ start_time: SEP_25 }, OCT_2, {})).toBe("allow");
  });

  it("says nothing when there is no date to judge", () => {
    expect(rescheduleVerdict({ start_time: null }, OCT_2, BILLED)).toBe("allow");
    expect(rescheduleVerdict(null, OCT_2, BILLED)).toBe("allow");
    expect(rescheduleVerdict({ start_time: SEP_25 }, null, BILLED)).toBe("allow");
    expect(rescheduleVerdict({ start_time: "not a date" }, OCT_2, BILLED)).toBe("allow");
  });

  it("takes a Date as readily as a string", () => {
    expect(rescheduleVerdict({ start_time: SEP_25 }, new Date(OCT_2), BILLED)).toBe("confirm");
  });
});

describe("rescheduleWarning", () => {
  it("names what would be lost", () => {
    expect(rescheduleWarning({ hasInvoice: true })).toContain("bill");
    expect(rescheduleWarning({ hasProcedure: true })).toContain("clinical notes");
    expect(rescheduleWarning({ hasInvoice: true, hasProcedure: true })).toContain("bill and clinical notes");
  });
});
