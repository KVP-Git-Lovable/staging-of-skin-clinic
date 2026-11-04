import { describe, it, expect } from "vitest";
import { pickAppointmentForInvoice, doctorForInvoice, sameLocalDay } from "./appointmentForInvoice";

/** Local-time ISO, so the test means the same thing wherever it runs. */
const at = (y: number, m: number, d: number, h: number, min = 0) =>
  new Date(y, m - 1, d, h, min).toISOString();

const DR_VINDHYA = "e82d048f-9a27-4e5b-91ff-ad9da4ff0c68";
const DR_OTHER = "11111111-1111-1111-1111-111111111111";

describe("pickAppointmentForInvoice", () => {
  it("links the only appointment the patient has that day", () => {
    // Spoorthi's case: one 12:30 PM visit, one bill raised from the Billing
    // page an hour later. It saved unlinked and her row read "No bill".
    const appts = [{ id: "a1", start_time: at(2026, 9, 24, 12, 30), staff_id: DR_VINDHYA }];
    expect(
      pickAppointmentForInvoice(appts, { invoiceDate: new Date(2026, 8, 24), doctorId: DR_VINDHYA }),
    ).toBe("a1");
  });

  it("links a lone same-day appointment even when the bill names another doctor", () => {
    // The doctor is a tie-breaker, not a filter: billing under a different
    // doctor than the one holding the slot is ordinary and must still link.
    const appts = [{ id: "a1", start_time: at(2026, 9, 24, 12, 30), staff_id: DR_VINDHYA }];
    expect(
      pickAppointmentForInvoice(appts, { invoiceDate: new Date(2026, 8, 24), doctorId: DR_OTHER }),
    ).toBe("a1");
  });

  it("ignores the patient's appointments on other days", () => {
    const appts = [
      { id: "before", start_time: at(2026, 9, 23, 17, 0), staff_id: DR_VINDHYA },
      { id: "after", start_time: at(2026, 9, 25, 9, 0), staff_id: DR_VINDHYA },
    ];
    expect(
      pickAppointmentForInvoice(appts, { invoiceDate: new Date(2026, 8, 24), doctorId: DR_VINDHYA }),
    ).toBeNull();
  });

  it("uses the doctor to choose between two visits on the same day", () => {
    const appts = [
      { id: "morning", start_time: at(2026, 9, 24, 10, 0), staff_id: DR_OTHER },
      { id: "evening", start_time: at(2026, 9, 24, 18, 0), staff_id: DR_VINDHYA },
    ];
    expect(
      pickAppointmentForInvoice(appts, { invoiceDate: new Date(2026, 8, 24), doctorId: DR_VINDHYA }),
    ).toBe("evening");
  });

  it("stays unlinked when two visits that day share the doctor", () => {
    // Kiran Shetty held two records for one 4:00 PM slot. Guessing here would
    // show the bill against a visit that may not be the billed one.
    const appts = [
      { id: "dup1", start_time: at(2026, 9, 24, 16, 0), staff_id: DR_VINDHYA },
      { id: "dup2", start_time: at(2026, 9, 24, 16, 0), staff_id: DR_VINDHYA },
    ];
    expect(
      pickAppointmentForInvoice(appts, { invoiceDate: new Date(2026, 8, 24), doctorId: DR_VINDHYA }),
    ).toBeNull();
  });

  it("stays unlinked when several visits that day and no doctor on the bill", () => {
    const appts = [
      { id: "a", start_time: at(2026, 9, 24, 10, 0), staff_id: DR_OTHER },
      { id: "b", start_time: at(2026, 9, 24, 18, 0), staff_id: DR_VINDHYA },
    ];
    expect(
      pickAppointmentForInvoice(appts, { invoiceDate: new Date(2026, 8, 24), doctorId: null }),
    ).toBeNull();
  });

  it("returns null for no date, no appointments, or unusable rows", () => {
    const appts = [{ id: "a1", start_time: at(2026, 9, 24, 12, 30), staff_id: DR_VINDHYA }];
    expect(pickAppointmentForInvoice(appts, { invoiceDate: null })).toBeNull();
    expect(pickAppointmentForInvoice(appts, { invoiceDate: new Date(NaN) })).toBeNull();
    expect(pickAppointmentForInvoice([], { invoiceDate: new Date(2026, 8, 24) })).toBeNull();
    expect(pickAppointmentForInvoice(null, { invoiceDate: new Date(2026, 8, 24) })).toBeNull();
    expect(
      pickAppointmentForInvoice(
        [{ id: "bad", start_time: null }, { id: "worse", start_time: "not a date" }],
        { invoiceDate: new Date(2026, 8, 24) },
      ),
    ).toBeNull();
  });
});

describe("sameLocalDay", () => {
  it("compares the calendar day, not the instant", () => {
    expect(sameLocalDay(new Date(2026, 8, 24, 0, 5), new Date(2026, 8, 24, 23, 55))).toBe(true);
    expect(sameLocalDay(new Date(2026, 8, 24, 23, 55), new Date(2026, 8, 25, 0, 5))).toBe(false);
  });
});

/**
 * Billing a patient from their record used to open an empty form - staff picked
 * the patient again and then the doctor from memory, and a bill could be saved
 * with neither. The visit already says who saw them.
 */
describe("doctorForInvoice", () => {
  it("takes the doctor from that day's visit", () => {
    expect(
      doctorForInvoice(
        [{ id: "a", start_time: at(2026, 9, 29, 11), staff_id: DR_VINDHYA }],
        new Date(2026, 8, 29),
      ),
    ).toBe(DR_VINDHYA);
  });

  it("ignores visits on other days, including a future booking", () => {
    expect(
      doctorForInvoice(
        [
          { id: "a", start_time: at(2026, 10, 5, 11), staff_id: DR_OTHER },
          { id: "b", start_time: at(2026, 9, 28, 11), staff_id: DR_OTHER },
        ],
        new Date(2026, 8, 29),
      ),
    ).toBeNull();
  });

  it("is happy when two visits that day were with the same doctor", () => {
    expect(
      doctorForInvoice(
        [
          { id: "a", start_time: at(2026, 9, 29, 11), staff_id: DR_VINDHYA },
          { id: "b", start_time: at(2026, 9, 29, 17), staff_id: DR_VINDHYA },
        ],
        new Date(2026, 8, 29),
      ),
    ).toBe(DR_VINDHYA);
  });

  it("names nobody when that day's visits disagree - a wrong doctor on a bill is worse than a blank", () => {
    expect(
      doctorForInvoice(
        [
          { id: "a", start_time: at(2026, 9, 29, 11), staff_id: DR_VINDHYA },
          { id: "b", start_time: at(2026, 9, 29, 17), staff_id: DR_OTHER },
        ],
        new Date(2026, 8, 29),
      ),
    ).toBeNull();
  });

  it("copes with no visits, no date and a visit carrying no doctor", () => {
    expect(doctorForInvoice([], new Date(2026, 8, 29))).toBeNull();
    expect(doctorForInvoice(null, new Date(2026, 8, 29))).toBeNull();
    expect(doctorForInvoice([{ id: "a", start_time: at(2026, 9, 29, 11), staff_id: DR_VINDHYA }], null)).toBeNull();
    expect(
      doctorForInvoice([{ id: "a", start_time: at(2026, 9, 29, 11), staff_id: null }], new Date(2026, 8, 29)),
    ).toBeNull();
  });
});
