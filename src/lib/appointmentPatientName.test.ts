import { describe, it, expect } from "vitest";
import {
  appointmentPatientName,
  appointmentPatientInitials,
  appointmentPatientInitialsText,
  appointmentPatientHaystack,
  appointmentPatientIsVip,
} from "./appointmentPatientName";

describe("appointmentPatientName", () => {
  it("shows the patient the appointment is filed under, not a stale copy of a name", () => {
    // The reported fault: the list read "Saher" and the page behind it "Baazi",
    // for one slot in the middle of Baazi's own course.
    expect(
      appointmentPatientName({ patient_name: "Saher", patients: { first_name: "Baazi", last_name: "" } })
    ).toBe("Baazi");
  });

  it("falls back to the stored copy where a screen fetched no patient record", () => {
    // Global search, staff detail, the photo picker and the appointments report
    // all query appointments without the join.
    expect(appointmentPatientName({ patient_name: "Nisha Rai", patients: null })).toBe("Nisha Rai");
  });

  it("never prints the word null after a patient with no surname", () => {
    // `${first_name} ${last_name}` was hand-rolled at every call site, so a
    // patient with no surname rendered "Baazi null" on some screens.
    expect(appointmentPatientName({ patient_name: null, patients: { first_name: "Baazi", last_name: null } })).toBe(
      "Baazi"
    );
  });

  it("tidies the double spaces the imported names carry", () => {
    expect(
      appointmentPatientName({ patient_name: null, patients: { first_name: "Surabhi S ", last_name: " Pai" } })
    ).toBe("Surabhi S Pai");
    expect(appointmentPatientName({ patient_name: "Surabhi S  Pai", patients: null })).toBe("Surabhi S Pai");
  });

  it("says something rather than nothing when neither is there", () => {
    expect(appointmentPatientName({ patient_name: "", patients: null })).toBe("—");
    expect(appointmentPatientName(null)).toBe("—");
    expect(appointmentPatientName(undefined, "Walk-in")).toBe("Walk-in");
    expect(appointmentPatientName({ patient_name: "   ", patients: { first_name: "", last_name: null } })).toBe("—");
  });
});

describe("appointmentPatientInitials", () => {
  it("takes the avatar from the same patient as the name beside it", () => {
    // The list row showed Baazi's photo and initials next to the text "Saher".
    expect(
      appointmentPatientInitials({ patient_name: "Saher", patients: { first_name: "Baazi", last_name: "" } })
    ).toEqual({ firstName: "Baazi", lastName: "" });
  });

  it("splits the stored copy when there is no record to read", () => {
    expect(appointmentPatientInitials({ patient_name: "Nisha Rai Kumar", patients: null })).toEqual({
      firstName: "Nisha",
      lastName: "Rai Kumar",
    });
  });

  it("gives empty halves rather than undefined when there is nothing", () => {
    expect(appointmentPatientInitials(null)).toEqual({ firstName: "", lastName: "" });
  });
});

describe("appointmentPatientInitialsText", () => {
  it("never renders the word undefined after a patient with no surname", () => {
    // The dashboard circle built these as first_name[0] + last_name[0], so a
    // one-word name came out as "Bundefined".
    expect(
      appointmentPatientInitialsText({ patient_name: null, patients: { first_name: "Baazi", last_name: "" } })
    ).toBe("B");
  });

  it("uses both halves when there are two", () => {
    expect(
      appointmentPatientInitialsText({ patient_name: null, patients: { first_name: "Nisha", last_name: "Rai" } })
    ).toBe("NR");
  });

  it("falls back to a question mark rather than nothing", () => {
    expect(appointmentPatientInitialsText(null)).toBe("?");
  });
});

describe("the records that hold a phone number where a name should be", () => {
  it("keeps a readable name rather than swapping it for digits", () => {
    // 153 imported patients have first_name equal to their phone number.
    expect(
      appointmentPatientName({ patient_name: "Prema Shetty", patients: { first_name: "6282285155", last_name: null } })
    ).toBe("Prema Shetty");
  });

  it("still shows the record when neither is readable", () => {
    expect(
      appointmentPatientName({ patient_name: "9999999999", patients: { first_name: "6282285155", last_name: null } })
    ).toBe("6282285155");
  });
});

describe("appointmentPatientHaystack", () => {
  it("matches either name, so searching cannot lose a row the server found", () => {
    // The server searches the stored copy, because a joined column cannot be
    // filtered on; a client filter reading only the record would hide rows.
    expect(
      appointmentPatientHaystack({ patient_name: "Saher", patients: { first_name: "Baazi", last_name: null } })
    ).toBe("Baazi Saher");
  });

  it("does not say a name twice when the two agree", () => {
    expect(
      appointmentPatientHaystack({ patient_name: "baazi", patients: { first_name: "Baazi", last_name: null } })
    ).toBe("Baazi");
  });

  it("falls back to whichever one exists", () => {
    expect(appointmentPatientHaystack({ patient_name: "Saher", patients: null })).toBe("Saher");
    expect(appointmentPatientHaystack(null)).toBe("");
  });
});

describe("appointmentPatientIsVip", () => {
  it("reads the flag off the linked record", () => {
    expect(appointmentPatientIsVip({ patients: { first_name: "Sanah", last_name: "Pai", is_vip: true } })).toBe(true);
    expect(appointmentPatientIsVip({ patients: { first_name: "Sanah", last_name: "Pai", is_vip: false } })).toBe(false);
  });

  // A screen that fetched appointments without the patient join must not guess.
  // A crown that should not be there sends the front desk fussing over the
  // wrong person, which is worse than one that is merely missing.
  it("says no when there is nothing to read it from", () => {
    expect(appointmentPatientIsVip({ patient_name: "Sanah Pai" })).toBe(false);
    expect(appointmentPatientIsVip({ patients: { first_name: "Sanah", last_name: "Pai" } })).toBe(false);
    expect(appointmentPatientIsVip({ patients: null })).toBe(false);
    expect(appointmentPatientIsVip(null)).toBe(false);
    expect(appointmentPatientIsVip(undefined)).toBe(false);
  });

  it("is not fooled by a value that is merely truthy", () => {
    expect(appointmentPatientIsVip({ patients: { first_name: "A", last_name: "B", is_vip: null } })).toBe(false);
  });
});
