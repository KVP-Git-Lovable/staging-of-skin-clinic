import { describe, expect, it } from "vitest";
import { isClinicTemplate, onlyClinicTemplates, TEMPLATE_FILTER_LABEL } from "./templateFilter";

describe("isClinicTemplate", () => {
  it("matches either keyword anywhere in the name", () => {
    expect(isClinicTemplate("skin_consult")).toBe(true);
    expect(isClinicTemplate("appointment_reminder")).toBe(true);
    expect(isClinicTemplate("post_skin_followup")).toBe(true);
  });

  it("ignores case, because Twilio names are not consistent about it", () => {
    expect(isClinicTemplate("SKIN_CONSULT")).toBe(true);
    expect(isClinicTemplate("Appointment-2")).toBe(true);
    expect(isClinicTemplate("SkInCare")).toBe(true);
  });

  it("rejects everything else", () => {
    expect(isClinicTemplate("invoice_due")).toBe(false);
    expect(isClinicTemplate("otp_login")).toBe(false);
    expect(isClinicTemplate("diwali_offer")).toBe(false);
  });

  it("treats a missing name as not ours rather than throwing", () => {
    expect(isClinicTemplate(null)).toBe(false);
    expect(isClinicTemplate(undefined)).toBe(false);
    expect(isClinicTemplate("")).toBe(false);
  });

  it("looks at the name only - a body mentioning an appointment is not enough", () => {
    // onlyClinicTemplates is given whole rows; it must not be tempted by other fields.
    const rows = [
      { name: "invoice_due", body: "Your appointment is on Monday" },
      { name: "skin_check", body: "Hello" },
    ];
    expect(onlyClinicTemplates(rows).map((r) => r.name)).toEqual(["skin_check"]);
  });

  it("exposes the rule as text for the UI to explain itself", () => {
    expect(TEMPLATE_FILTER_LABEL).toBe('"skin" or "appointment"');
  });
});
