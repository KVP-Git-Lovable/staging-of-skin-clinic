import { describe, it, expect } from "vitest";
import {
  appointmentStatusClasses,
  appointmentStatusLabel,
  ALL_APPOINTMENT_STATUSES,
  AUTOMATIC_APPOINTMENT_STATUSES,
  MANUAL_APPOINTMENT_STATUSES,
  APPOINTMENT_STATUS_STYLES,
  showsAsBilled,
  BILLED_BADGE_CLASSES,
} from "./appointmentStatus";
import { invoiceMapByAppointment } from "./invoicesForAppointments";

/**
 * A patient's Appts tab showed Cancelled in the same grey badge as Completed,
 * so front desk could not see at a glance that a visit had been called off.
 */
describe("appointmentStatusClasses", () => {
  it("puts a cancelled visit in red", () => {
    expect(appointmentStatusClasses("Cancelled")).toContain("text-destructive");
  });

  it("puts a no show in red too - front desk read them the same way", () => {
    expect(appointmentStatusClasses("No Show")).toContain("text-destructive");
  });

  it("does not paint a completed visit red", () => {
    expect(appointmentStatusClasses("Completed")).not.toContain("destructive");
    expect(appointmentStatusClasses("Completed")).toContain("text-success");
  });

  it("falls back to a normal badge for a status it does not know", () => {
    // Older Salesforce rows still carry statuses the app no longer offers.
    expect(appointmentStatusClasses("Scheduled")).toBe("bg-muted text-muted-foreground");
  });

  it("falls back rather than returning nothing for a blank status", () => {
    expect(appointmentStatusClasses(null)).toBe("bg-muted text-muted-foreground");
    expect(appointmentStatusClasses(undefined)).toBe("bg-muted text-muted-foreground");
    expect(appointmentStatusClasses("")).toBe("bg-muted text-muted-foreground");
  });

  it("tolerates stray whitespace around a stored status", () => {
    expect(appointmentStatusClasses(" Cancelled ")).toContain("text-destructive");
  });

  it("styles every status the app can set", () => {
    for (const status of ALL_APPOINTMENT_STATUSES) {
      expect(appointmentStatusClasses(status)).not.toBe("bg-muted text-muted-foreground");
    }
  });
});

/**
 * The front desk reads a row to find out whether the bill is done. "Completed"
 * is set by a trigger when the invoice is paid, so that is what it means - but
 * it does not say so.
 */
describe("appointmentStatusLabel", () => {
  it("calls a visit with a bill Billed, whatever its status says", () => {
    expect(appointmentStatusLabel("Completed", true)).toBe("Billed");
    // The other direction the clinic reported: a visit still sitting on
    // Confirmed because the patient paid minutes before her slot and the
    // trigger skipped her. It has a bill, so it reads Billed.
    expect(appointmentStatusLabel("Confirmed", true)).toBe("Billed");
  });

  it("leaves every status exactly as it is when there is no bill", () => {
    for (const status of ALL_APPOINTMENT_STATUSES) {
      expect(appointmentStatusLabel(status, false)).toBe(status);
    }
  });

  // Salesforce-era values that predate the list above still have to read.
  it("passes through a status it has never heard of", () => {
    expect(appointmentStatusLabel("Scheduled")).toBe("Scheduled");
    expect(appointmentStatusLabel("Checked-in")).toBe("Checked-in");
    expect(appointmentStatusLabel("Requested")).toBe("Requested");
  });

  it("has nothing to say about nothing", () => {
    expect(appointmentStatusLabel(null)).toBe("");
    expect(appointmentStatusLabel(undefined)).toBe("");
    expect(appointmentStatusLabel("")).toBe("");
  });

  /**
   * The guard that matters. "Billed" is a word on a badge; "Completed" is the
   * value a database trigger writes, the dashboard counts, saved views filter
   * on and the visit rollups read. If anyone ever "tidies" the label into the
   * stored value, this fails before it reaches the clinic.
   */
  it("is a label, not a rename - the stored value is still Completed", () => {
    expect(AUTOMATIC_APPOINTMENT_STATUSES).toContain("Completed");
    expect(ALL_APPOINTMENT_STATUSES).toContain("Completed");
    for (const list of [MANUAL_APPOINTMENT_STATUSES, AUTOMATIC_APPOINTMENT_STATUSES]) {
      expect(list).not.toContain("Billed");
    }
    expect(appointmentStatusClasses("Completed")).toContain("text-success");
    expect(appointmentStatusClasses("Billed")).toBe("bg-muted text-muted-foreground");
  });
});

/**
 * The reported fault: a patient paid ₹1,250 at 06:20 for a 06:30 appointment,
 * and the row still read "Confirmed" while the dashboard's Billed card read 0.
 *
 * The trigger that writes "Completed" only fires once, on the invoice, and
 * skips any appointment whose start time has not arrived - so paying early
 * leaves the status wrong for ever. The status cannot be trusted to answer
 * "is this billed?"; the invoice can.
 */
describe("appointmentStatusLabel, when the caller knows about the bill", () => {
  it("says Billed for a visit that has one, whatever the status says", () => {
    expect(appointmentStatusLabel("Confirmed", true)).toBe("Billed");
    expect(appointmentStatusLabel("Reserved", true)).toBe("Billed");
    expect(appointmentStatusLabel("Completed", true)).toBe("Billed");
  });

  // 45 visits in 90 days are marked Completed with no bill behind them.
  it("does not call a visit Billed when there is no bill", () => {
    expect(appointmentStatusLabel("Completed", false)).toBe("Completed");
    expect(appointmentStatusLabel("Confirmed", false)).toBe("Confirmed");
    expect(appointmentStatusLabel("Cancelled", false)).toBe("Cancelled");
  });

  /**
   * The reported bug, and the reason not-knowing no longer guesses.
   *
   * A patient who never attended and was never invoiced read "Billed" on her
   * Appts tab, because a Salesforce import had marked the visit Completed and
   * that screen fetched no invoices. Guessing from the status is what did it:
   * 4,759 Completed appointments in this clinic have no bill behind them.
   *
   * Not knowing now looks exactly like not billed. A caller that forgets the
   * flag is merely less informative; it cannot claim money that was never
   * taken.
   */
  it("NEVER says Billed when the caller did not look for a bill", () => {
    expect(appointmentStatusLabel("Completed")).toBe("Completed");
    expect(appointmentStatusLabel("Completed", undefined)).toBe("Completed");
    expect(appointmentStatusLabel("Confirmed")).toBe("Confirmed");
  });

  it("still has nothing to say about nothing", () => {
    expect(appointmentStatusLabel(null, false)).toBe("");
    expect(appointmentStatusLabel(undefined, true)).toBe("Billed");
    expect(appointmentStatusLabel("", false)).toBe("");
  });
});

/**
 * The colour has to follow the word. In the appointments list "Confirmed" and
 * "Completed" were both bg-success/15, so a paid visit and an unpaid one were
 * the same pale green and only the text told them apart.
 */
describe("showsAsBilled", () => {
  it("agrees with the word, in every case the word has", () => {
    for (const [status, billed] of [
      ["Confirmed", true], ["Reserved", true], ["Completed", true],
      ["Completed", false], ["Confirmed", false], ["Cancelled", false],
      ["Completed", undefined], ["Confirmed", undefined], ["Scheduled", undefined],
    ] as [string, boolean | undefined][]) {
      expect(showsAsBilled(status, billed)).toBe(
        appointmentStatusLabel(status, billed) === "Billed",
      );
    }
  });

  it("lights up for a billed visit whatever its status", () => {
    expect(showsAsBilled("Confirmed", true)).toBe(true);
    expect(showsAsBilled("Completed", true)).toBe(true);
  });

  // The colour has to go quiet with the word. A screen that cannot see the
  // invoices must not paint the row solid green either.
  it("stays off when the caller did not look for a bill", () => {
    expect(showsAsBilled("Completed")).toBe(false);
    expect(showsAsBilled("Completed", undefined)).toBe(false);
  });

  // 45 visits in 90 days are Completed with no bill behind them; they must not
  // be painted as paid.
  it("stays off for a visit with no bill", () => {
    expect(showsAsBilled("Completed", false)).toBe(false);
    expect(showsAsBilled("Confirmed", false)).toBe(false);
    expect(showsAsBilled("Confirmed")).toBe(false);
  });
});

describe("BILLED_BADGE_CLASSES", () => {
  // The bug being fixed: Billed and Confirmed were the same pale green.
  it("is not the tint Confirmed wears", () => {
    expect(APPOINTMENT_STATUS_STYLES.Confirmed).toContain("/10");
    expect(BILLED_BADGE_CLASSES).not.toContain("/10");
    expect(BILLED_BADGE_CLASSES).not.toContain("/15");
    expect(BILLED_BADGE_CLASSES).toContain("bg-success");
    expect(BILLED_BADGE_CLASSES).toContain("text-success-foreground");
  });

  it("carries the arrival animation the stylesheet defines", () => {
    expect(BILLED_BADGE_CLASSES).toContain("billed-badge");
  });
});

/**
 * The badge a patient's Appts tab shows, end to end.
 *
 * The reported case: Dia K's 25 September visit read "Billed" although she
 * did not attend and was never invoiced, while two visits she HAD paid for
 * read only "Confirmed". Both came from reading the status instead of the
 * bill - the 25th arrived from Salesforce already marked Completed, and the
 * other two were paid minutes before their slot, which the completing
 * trigger skips.
 *
 * The two helpers are exercised together here because that pairing IS the
 * fix: invoiceMapByAppointment decides what counts as a bill, and the label
 * reports it. Testing them apart would not have caught the original bug.
 */
describe("the Appts tab badge, against the reported case", () => {
  const VISITS = [
    { id: "nov03", status: "Completed" },
    { id: "sep25", status: "Completed" },
    { id: "sep02", status: "Confirmed" },
    { id: "aug13", status: "Confirmed" },
  ];
  // Her real bills: three of them, and nothing at all for the 25th.
  const BILLS = [
    { id: "i1", appointment_id: "nov03", status: "Paid" },
    { id: "i2", appointment_id: "sep02", status: "Paid" },
    { id: "i3", appointment_id: "aug13", status: "Paid" },
  ];

  const badges = (bills: typeof BILLS) => {
    const billed = new Set(invoiceMapByAppointment(bills).keys());
    return VISITS.map((v) => appointmentStatusLabel(v.status, billed.has(v.id)));
  };

  it("says Billed for the three she paid for and Completed for the one she did not", () => {
    expect(badges(BILLS)).toEqual(["Billed", "Completed", "Billed", "Billed"]);
  });

  it("does not count a cancelled or merged bill as money taken", () => {
    // A visit whose only bill was voided has not been billed. The dashboard's
    // own copy of this rule missed "Merged" and double-counted those.
    expect(badges([{ id: "i1", appointment_id: "nov03", status: "Cancelled" }])[0]).toBe("Completed");
    expect(badges([{ id: "i1", appointment_id: "nov03", status: "Merged" }])[0]).toBe("Completed");
  });

  it("ignores a bill that names no visit", () => {
    expect(badges([{ id: "i1", appointment_id: null, status: "Paid" }])[0]).toBe("Completed");
  });
});
