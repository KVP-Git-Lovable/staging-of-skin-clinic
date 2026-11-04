import { describe, it, expect } from "vitest";
import { appointmentDeleteNote } from "./appointmentDeleteNote";

describe("appointmentDeleteNote", () => {
  it("keeps the existing warning about bills, procedures, notes and feedback", () => {
    for (const fromSalesforce of [true, false]) {
      const note = appointmentDeleteNote(fromSalesforce);
      expect(note).toContain("bills and procedures are kept");
      expect(note).toContain("notes or feedback on it are removed for good");
    }
  });

  it("says a Salesforce appointment will not come back", () => {
    const note = appointmentDeleteNote(true);
    expect(note).toContain("came from Salesforce");
    expect(note).toContain("the sync will not bring it back");
    expect(note).toContain("still exists in Salesforce");
  });

  it("says nothing about Salesforce for an appointment booked in the app", () => {
    expect(appointmentDeleteNote(false)).not.toMatch(/Salesforce/i);
  });

  it("puts the existing warning first, so the familiar sentence does not move", () => {
    expect(appointmentDeleteNote(true).indexOf("bills and procedures")).toBeLessThan(
      appointmentDeleteNote(true).indexOf("Salesforce"),
    );
  });
});
