import { describe, it, expect } from "vitest";
import { bookingPatientFrom } from "./bookingPatient";

const ID = "44ea39c3-2af7-47dd-a35f-8e70dbfc7507";

describe("bookingPatientFrom", () => {
  it("carries the phone a confirmation needs", () => {
    expect(bookingPatientFrom({ id: ID, first_name: "Nafeesa", last_name: "Shahana", phone: "9074066560" })).toEqual({
      id: ID,
      name: "Nafeesa Shahana",
      phone: "9074066560",
      gender: null,
    });
  });

  it("handles a patient entered with no last name, as most here are", () => {
    expect(bookingPatientFrom({ id: ID, first_name: "Nafeesa Shahana", last_name: "", phone: "90740" })?.name).toBe(
      "Nafeesa Shahana",
    );
  });

  it("reports no phone only when there really is none", () => {
    expect(bookingPatientFrom({ id: ID, first_name: "A", phone: null })?.phone).toBeNull();
    expect(bookingPatientFrom({ id: ID, first_name: "A", phone: "   " })?.phone).toBeNull();
  });

  it("keeps gender, which the cached list never even selected", () => {
    expect(bookingPatientFrom({ id: ID, first_name: "A", gender: "Female" })?.gender).toBe("Female");
  });

  it("is null when there is no patient, rather than a half-built one", () => {
    expect(bookingPatientFrom(null)).toBeNull();
    expect(bookingPatientFrom(undefined)).toBeNull();
    expect(bookingPatientFrom({ first_name: "No id" })).toBeNull();
  });

  it("gives a nameless record a null name rather than a blank one", () => {
    expect(bookingPatientFrom({ id: ID, first_name: "", last_name: "  " })?.name).toBeNull();
  });
});
