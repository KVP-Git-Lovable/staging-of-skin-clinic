import { describe, it, expect } from "vitest";
import { patientInitials, avatarStoragePath } from "./patientAvatar";

describe("patientInitials", () => {
  it("takes a letter from each name", () => {
    expect(patientInitials("Harshitha", "Kamath")).toBe("HK");
  });

  it("gives one letter when there is no surname, which is most of them", () => {
    expect(patientInitials("Harshitha", "")).toBe("H");
    expect(patientInitials("Harshitha", null)).toBe("H");
    expect(patientInitials("Harshitha", "   ")).toBe("H");
  });

  it("never leaves the circle empty", () => {
    // first_name[0] on a blank name rendered nothing at all, which reads as a
    // page that failed to load rather than a record missing a name.
    expect(patientInitials("", "")).toBe("?");
    expect(patientInitials(null, null)).toBe("?");
    expect(patientInitials(undefined, undefined)).toBe("?");
    expect(patientInitials("   ", "   ")).toBe("?");
  });

  it("ignores the spaces several patient names are stored with", () => {
    expect(patientInitials("  Shaida ", " Pai ")).toBe("SP");
  });

  it("upper-cases, so the circle reads the same for everyone", () => {
    expect(patientInitials("harshitha", "kamath")).toBe("HK");
  });
});

describe("avatarStoragePath", () => {
  const PATIENT = "8d6be5ca-ec53-4268-a9f6-24a8764457e5";

  it("keeps the portrait in the patient's own folder, as every other photo is", () => {
    expect(avatarStoragePath(PATIENT, "shot.jpg", 1700000000000))
      .toMatch(new RegExp(`^${PATIENT}/avatar-1700000000000-[a-z0-9]+\\.jpg$`));
  });

  it("keeps the file's own type", () => {
    expect(avatarStoragePath(PATIENT, "shot.png", 1)).toMatch(/\.png$/);
    expect(avatarStoragePath(PATIENT, "shot.HEIC", 1)).toMatch(/\.heic$/);
    expect(avatarStoragePath(PATIENT, "shot.webp", 1)).toMatch(/\.webp$/);
  });

  it("falls back to jpg for anything it does not recognise", () => {
    expect(avatarStoragePath(PATIENT, "shot.exe", 1)).toMatch(/\.jpg$/);
    expect(avatarStoragePath(PATIENT, "noextension", 1)).toMatch(/\.jpg$/);
    expect(avatarStoragePath(PATIENT, "", 1)).toMatch(/\.jpg$/);
    expect(avatarStoragePath(PATIENT, null, 1)).toMatch(/\.jpg$/);
  });

  it("gives a different path each time, even within the same millisecond", () => {
    // A fixed name would be served from cache long after it changed, and the
    // clinic would swear the new photo had not saved.
    const a = avatarStoragePath(PATIENT, "shot.jpg", 1700000000000);
    const b = avatarStoragePath(PATIENT, "shot.jpg", 1700000000000);
    expect(a).not.toBe(b);
  });
});
