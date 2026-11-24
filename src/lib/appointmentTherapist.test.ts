import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  THERAPIST_ROLES,
  isTherapistRole,
  therapistDisplayName,
  therapistNoteTitle,
} from "./appointmentTherapist";

/**
 * The clinic wanted to record who actually did the treatment, and to be able
 * to swap that person out when an emergency moves people around. These are
 * the decisions behind the therapist field.
 */
describe("THERAPIST_ROLES", () => {
  it("lists therapists AND nurses, and nobody else", () => {
    // The clinic was asked once and chose therapists only; they came back
    // because nurses assist just as often. Order matters only in that the
    // four pickers share this one constant and so cannot drift apart.
    expect([...THERAPIST_ROLES]).toEqual(["Therapist", "Nurse"]);
  });

  it("matches the exact spelling staff.role uses", () => {
    // staff.role is free text with no constraint behind it; the value comes
    // from FALLBACK_ROLES in StaffManagement.tsx. A case mismatch here filters
    // the lookup down to nobody, silently.
    const staffManagement = readFileSync("src/pages/StaffManagement.tsx", "utf8");
    for (const role of THERAPIST_ROLES) {
      expect(staffManagement).toContain(`"${role}"`);
    }
  });
});

describe("isTherapistRole", () => {
  it("accepts both roles as Staff Management spells them", () => {
    expect(isTherapistRole("Therapist")).toBe(true);
    expect(isTherapistRole("Nurse")).toBe(true);
  });

  it("is case- and whitespace-insensitive", () => {
    // staff.role is free text with no constraint behind it. A row saved as
    // "therapist" must not quietly vanish from the lookup.
    expect(isTherapistRole("therapist")).toBe(true);
    expect(isTherapistRole("THERAPIST")).toBe(true);
    expect(isTherapistRole("  Therapist  ")).toBe(true);
  });

  it("REFUSES every other role in this clinic", () => {
    // Widened to nurses, not thrown open. A doctor is recorded in the Doctor
    // field and must not also be offered here, and "Staff" - the role an
    // account gets by default - must never be assignable to a treatment.
    for (const role of ["Doctor", "Receptionist", "Lab Technician", "Admin", "Pharmacist", "Staff"]) {
      expect(isTherapistRole(role), role).toBe(false);
    }
  });

  it("refuses a missing or partial role rather than guessing", () => {
    expect(isTherapistRole("")).toBe(false);
    expect(isTherapistRole("   ")).toBe(false);
    expect(isTherapistRole(null)).toBe(false);
    expect(isTherapistRole(undefined)).toBe(false);
    expect(isTherapistRole("Therapists")).toBe(false);
    expect(isTherapistRole("Senior Therapist")).toBe(false);
    expect(isTherapistRole("Nurses")).toBe(false);
    expect(isTherapistRole("Head Nurse")).toBe(false);
  });
});

describe("therapistDisplayName", () => {
  it("reads the stored name", () => {
    expect(therapistDisplayName({ therapist_name: "Rita ." })).toBe("Rita .");
  });

  it("PREFERS the stored name over the joined staff row", () => {
    // The column is filled by a database trigger and then kept. A therapist
    // who has left the clinic still shows on the visits they worked, where
    // the join would have gone null - so the stored name has to win.
    expect(
      therapistDisplayName({
        therapist_name: "Reena .",
        therapist: { first_name: "Somebody", last_name: "Else" },
      }),
    ).toBe("Reena .");
  });

  it("falls back to the joined row when nothing was stored", () => {
    expect(
      therapistDisplayName({ therapist_name: null, therapist: { first_name: "Suchitra", last_name: "." } }),
    ).toBe("Suchitra .");
  });

  it("treats blank and whitespace as no therapist, not as a name", () => {
    expect(therapistDisplayName({ therapist_name: "   " })).toBe("");
    expect(therapistDisplayName({ therapist_name: "" })).toBe("");
    expect(therapistDisplayName({})).toBe("");
    expect(therapistDisplayName(null)).toBe("");
    expect(therapistDisplayName(undefined)).toBe("");
  });

  it("copes with half a joined row", () => {
    expect(therapistDisplayName({ therapist: { first_name: "Rita" } })).toBe("Rita");
    expect(therapistDisplayName({ therapist: { last_name: "Pai" } })).toBe("Pai");
    expect(therapistDisplayName({ therapist: null })).toBe("");
  });
});

describe("therapistNoteTitle", () => {
  it("opens a new note with the therapist's name", () => {
    expect(therapistNoteTitle("Rita .")).toBe("Therapy note - Rita .");
  });

  it("prefills NOTHING when no therapist is assigned", () => {
    // The composer must open empty rather than titled about nobody.
    expect(therapistNoteTitle("")).toBe("");
    expect(therapistNoteTitle("   ")).toBe("");
    expect(therapistNoteTitle(null)).toBe("");
    expect(therapistNoteTitle(undefined)).toBe("");
  });

  it("says the same thing as the Salesforce therapy-note import", () => {
    // sf-import-therapy-notes already titles imported notes "Therapy note -
    // {doctor}". A note typed in the app and a note that came across in the
    // migration have to read identically in the same list, so if either side
    // is reworded this fails and the other has to follow.
    const fn = readFileSync("supabase/functions/sf-import-therapy-notes/index.ts", "utf8");
    const template = fn.match(/`Therapy note - \$\{(\w+)\}`/);
    expect(template, "sf-import-therapy-notes no longer builds a 'Therapy note - X' title").not.toBeNull();
    const variable = template![1];
    const rebuilt = `Therapy note - \${${variable}}`.replace(`\${${variable}}`, "Rita .");
    expect(therapistNoteTitle("Rita .")).toBe(rebuilt);
  });
});
