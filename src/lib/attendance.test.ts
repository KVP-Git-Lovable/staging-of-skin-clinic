import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  dayButtons,
  dayPhase,
  elapsedLabel,
  faceVerdict,
  greeting,
  hoursWorked,
  attendancePhotoPath,
  MAX_FACE_ATTEMPTS,
  faceFailureReason,
} from "./attendance";

/**
 * The clinic opened the attendance screen and reported that it had no
 * day-start or day-end option. It had one button that swapped its own label.
 * Both are on screen now, as the reference app shows them, and these tests
 * exist so that never silently becomes one button again.
 */
describe("dayButtons", () => {
  const notStarted = { check_in_time: null, check_out_time: null };
  const working = { check_in_time: "2026-11-03T09:00:00Z", check_out_time: null };
  const finished = { check_in_time: "2026-11-03T09:00:00Z", check_out_time: "2026-11-03T18:00:00Z" };

  it("offers Start My Day, and refuses End My Day, before the day begins", () => {
    const b = dayButtons(notStarted);
    expect(b.start.label).toBe("Start My Day");
    expect(b.start.disabled).toBe(false);
    expect(b.end.label).toBe("End My Day");
    // Nobody ends a day they never started.
    expect(b.end.disabled).toBe(true);
  });

  it("treats no record at all the same as a day not yet begun", () => {
    for (const empty of [null, undefined]) {
      const b = dayButtons(empty);
      expect(b.start.disabled).toBe(false);
      expect(b.end.disabled).toBe(true);
    }
  });

  it("swaps to Day Started and opens End My Day once they are in", () => {
    const b = dayButtons(working);
    expect(b.start.label).toBe("Day Started");
    // There is nothing left to start - and pressing it again would try to
    // insert a second row for the same day.
    expect(b.start.disabled).toBe(true);
    expect(b.end.label).toBe("End My Day");
    expect(b.end.disabled).toBe(false);
  });

  it("closes both once the day is done", () => {
    const b = dayButtons(finished);
    expect(b.start.label).toBe("Day Ended");
    expect(b.end.label).toBe("Day Ended");
    expect(b.start.disabled).toBe(true);
    expect(b.end.disabled).toBe(true);
  });

  it("never leaves both buttons live at once", () => {
    for (const row of [notStarted, working, finished]) {
      const b = dayButtons(row);
      expect(b.start.disabled && b.end.disabled ? 0 : b.start.disabled || b.end.disabled ? 1 : 2)
        .toBeLessThanOrEqual(1);
    }
  });
});

/**
 * The clinic's rule is "no match, no attendance". The thing these tests exist
 * to hold is the OTHER half: a service error is not a mismatch, and must not
 * be allowed to become one. The app this follows made exactly that mistake
 * and locked people out of ending their day.
 */
describe("faceVerdict", () => {
  const verified = { status: "verified" as const, confidence: 92 };
  const mismatch = { status: "failed" as const, confidence: 31 };
  const serviceDown = { status: "bypassed" as const, confidence: 0 };

  it("saves silently when the face matches", () => {
    const v = faceVerdict(verified, 1);
    expect(v.proceed).toBe(true);
    expect(v.retry).toBe(false);
    expect(v.message).toBe("");
    expect(v.recordStatus).toBe("verified");
  });

  it("NEVER saves attendance on a real mismatch, on any attempt", () => {
    for (let attempt = 1; attempt <= MAX_FACE_ATTEMPTS + 2; attempt++) {
      expect(faceVerdict(mismatch, attempt).proceed).toBe(false);
    }
  });

  it("says the face did not match, with the confidence and the attempt", () => {
    const v = faceVerdict(mismatch, 1);
    expect(v.message).toMatch(/face verification failed/i);
    expect(v.message).toContain("31%");
    expect(v.message).toContain(`1/${MAX_FACE_ATTEMPTS}`);
    expect(v.retry).toBe(true);
  });

  it("stops offering retries after the last attempt and sends them to an admin", () => {
    const v = faceVerdict(mismatch, MAX_FACE_ATTEMPTS);
    expect(v.retry).toBe(false);
    expect(v.proceed).toBe(false);
    expect(v.message).toMatch(/contact your admin/i);
  });

  it("retries a SERVICE error without calling it a mismatch", () => {
    const v = faceVerdict(serviceDown, 1);
    expect(v.proceed).toBe(false);
    expect(v.retry).toBe(true);
    expect(v.message).toMatch(/service error/i);
    // The person's face was never compared, so saying it did not match is a lie.
    expect(v.message).not.toMatch(/does not match/i);
  });

  it("SAVES the attendance when the service is still down after the last attempt", () => {
    // The whole point: a broken gateway must not cost somebody their day.
    const v = faceVerdict(serviceDown, MAX_FACE_ATTEMPTS);
    expect(v.proceed).toBe(true);
    expect(v.retry).toBe(false);
    expect(v.recordStatus).toBe("bypassed");
    expect(v.message).toMatch(/flagged for review/i);
  });

  it("honours an attempt cap the clinic configured, not a hardcoded three", () => {
    // attendance_config.face_max_attempts. The reference hardcodes 3.
    const first = faceVerdict(mismatch, 1, 2);
    expect(first.retry).toBe(true);
    expect(first.message).toContain("1/2");
    const last = faceVerdict(mismatch, 2, 2);
    expect(last.retry).toBe(false);
    expect(last.message).toMatch(/after 2 attempts/);
  });

  it("falls back to three when the setting is nonsense, rather than nought or endless", () => {
    // A zero cap would refuse everybody on their first try; a NaN would let
    // somebody retry for ever.
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      expect(faceVerdict(mismatch, 3, bad).retry).toBe(false);
      expect(faceVerdict(mismatch, 1, bad).retry).toBe(true);
    }
  });

  it("records which way it was decided, so an admin can tell them apart", () => {
    expect(faceVerdict(verified, 1).recordStatus).toBe("verified");
    expect(faceVerdict(mismatch, 1).recordStatus).toBe("failed");
    expect(faceVerdict(serviceDown, 1).recordStatus).toBe("bypassed");
  });
});

describe("hoursWorked", () => {
  it("counts the hours between the two ends", () => {
    expect(hoursWorked("2026-11-02T09:00:00Z", "2026-11-02T17:30:00Z")).toBe(8.5);
  });

  it("rounds to two decimals rather than a recurring number", () => {
    expect(hoursWorked("2026-11-02T09:00:00Z", "2026-11-02T09:50:00Z")).toBe(0.83);
  });

  it("has no answer until both ends exist", () => {
    expect(hoursWorked("2026-11-02T09:00:00Z", null)).toBeNull();
    expect(hoursWorked(null, "2026-11-02T17:00:00Z")).toBeNull();
    expect(hoursWorked(null, null)).toBeNull();
    expect(hoursWorked("not a date", "2026-11-02T17:00:00Z")).toBeNull();
  });

  it("counts a shift that runs past midnight", () => {
    expect(hoursWorked("2026-11-02T21:00:00Z", "2026-11-03T02:00:00Z")).toBe(5);
  });

  it("reads a backwards pair as zero, not as negative work", () => {
    // A clock or data fault, which must not quietly subtract from a total.
    expect(hoursWorked("2026-11-02T17:00:00Z", "2026-11-02T09:00:00Z")).toBe(0);
  });
});

describe("attendancePhotoPath", () => {
  const STAFF = "8d6be5ca-ec53-4268-a9f6-24a8764457e5";

  it("files the photo under the staff member's own id", () => {
    // The bucket policy lets a person write only inside their own folder, so
    // the path is the permission - get it wrong and the upload is refused.
    expect(attendancePhotoPath(STAFF, "check_in")).toMatch(new RegExp(`^${STAFF}/`));
  });

  it("says which end of the day it is, and when", () => {
    const at = new Date(2026, 10, 2, 9, 42);
    expect(attendancePhotoPath(STAFF, "check_in", at)).toContain("2026-11-02_check_in_");
    expect(attendancePhotoPath(STAFF, "check_out", at)).toContain("2026-11-02_check_out_");
  });

  it("never collides, even twice in the same millisecond", () => {
    const at = new Date(2026, 10, 2, 9, 42);
    expect(attendancePhotoPath(STAFF, "check_in", at)).not.toBe(attendancePhotoPath(STAFF, "check_in", at));
  });

  it("is always a .jpg, which is what the camera hands us", () => {
    expect(attendancePhotoPath(STAFF, "check_in")).toMatch(/\.jpg$/);
  });
});

describe("dayPhase", () => {
  it("is not_started with no record at all", () => {
    expect(dayPhase(null)).toBe("not_started");
    expect(dayPhase(undefined)).toBe("not_started");
    expect(dayPhase({} as never)).toBe("not_started");
  });

  it("is running once checked in", () => {
    expect(dayPhase({ check_in_time: "2026-11-03T09:00:00Z" } as never)).toBe("running");
  });

  it("is complete once checked out", () => {
    expect(dayPhase({
      check_in_time: "2026-11-03T09:00:00Z",
      check_out_time: "2026-11-03T18:00:00Z",
    } as never)).toBe("complete");
  });

  it("treats a check-out with no check-in as complete, not running", () => {
    // Data fault rather than a real state, but the card must not sit there
    // counting up forever from nothing.
    expect(dayPhase({ check_out_time: "2026-11-03T18:00:00Z" } as never)).toBe("complete");
  });
});

describe("elapsedLabel", () => {
  const now = new Date("2026-11-03T12:42:00+05:30");

  it("counts up to now while the day is still open", () => {
    expect(elapsedLabel("2026-11-03T09:00:00+05:30", null, now)).toBe("3h 42m");
  });

  it("drops the hours entirely under an hour", () => {
    expect(elapsedLabel("2026-11-03T12:20:00+05:30", null, now)).toBe("22m");
  });

  it("IGNORES now once the day is closed", () => {
    // The whole reason now is a parameter. A card left open overnight would
    // otherwise keep counting a day that ended at six.
    expect(elapsedLabel("2026-11-03T09:00:00+05:30", "2026-11-03T18:00:00+05:30", now)).toBe("9h 0m");
  });

  it("is null before the day starts", () => {
    expect(elapsedLabel(null, null, now)).toBeNull();
    expect(elapsedLabel(undefined, "2026-11-03T18:00:00+05:30", now)).toBeNull();
  });

  it("reads 0m rather than a negative when the clock disagrees", () => {
    expect(elapsedLabel("2026-11-03T18:00:00+05:30", "2026-11-03T09:00:00+05:30", now)).toBe("0m");
  });

  it("floors rather than rounds, so it never claims time not yet worked", () => {
    // 90 seconds. Rounding would call this "2m" - two minutes credited for
    // one and a half. A one-second gap proves nothing here: floor and round
    // both give 0m, which is how the first version of this test passed
    // against a mutant using Math.round.
    expect(elapsedLabel("2026-11-03T12:40:30+05:30", null, now)).toBe("1m");
    // 3h 59m 59s must not become 4h.
    expect(elapsedLabel("2026-11-03T08:42:01+05:30", null, now)).toBe("3h 59m");
  });

  it("survives an unparseable timestamp instead of printing NaN", () => {
    expect(elapsedLabel("not a date", null, now)).toBeNull();
    expect(elapsedLabel("2026-11-03T09:00:00+05:30", "rubbish", now)).toBe("3h 42m");
  });
});

describe("greeting", () => {
  // The suite runs with TZ=Asia/Kolkata (see vitest.config.ts), which is the
  // clinic's clock. These offsets are written out so the test keeps meaning
  // the same thing if that ever changes.
  it("greets by the local clock, not UTC", () => {
    expect(greeting(new Date("2026-11-03T09:00:00+05:30"))).toBe("Good morning");
    expect(greeting(new Date("2026-11-03T14:00:00+05:30"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-11-03T20:00:00+05:30"))).toBe("Good evening");
  });

  it("switches exactly on the hour boundaries", () => {
    expect(greeting(new Date("2026-11-03T11:59:00+05:30"))).toBe("Good morning");
    expect(greeting(new Date("2026-11-03T12:00:00+05:30"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-11-03T16:59:00+05:30"))).toBe("Good afternoon");
    expect(greeting(new Date("2026-11-03T17:00:00+05:30"))).toBe("Good evening");
  });

  it("greets the small hours as morning, which is when a night shift ends", () => {
    expect(greeting(new Date("2026-11-03T02:00:00+05:30"))).toBe("Good morning");
  });
});

/**
 * Saying why, when the answer is not "try again".
 *
 * 17 of the clinic's 18 active staff have no profile photo. The face check
 * compares a selfie against staff.photo_url, so for all 17 the function
 * answers "Set your profile photo first" - and every one of them was told
 * "Face verification service error. Attempt 1/3. Please try again." three
 * times before being let in flagged for review.
 */
describe("faceFailureReason", () => {
  it("recognises the two refusals the function actually sends", () => {
    expect(faceFailureReason("Set your profile photo first")).toBe("no_photo");
    expect(faceFailureReason("No staff record for this login")).toBe("not_staff");
  });

  it("does not care about case or surrounding words", () => {
    expect(faceFailureReason("ERROR: set your PROFILE PHOTO first.")).toBe("no_photo");
  });

  it("returns nothing for anything it does not know", () => {
    // A new error string must leave the old service-fault path alone rather
    // than stranding somebody at the door with a message that fits nothing.
    expect(faceFailureReason("That photo is not yours")).toBeNull();
    expect(faceFailureReason("Please sign in")).toBeNull();
    expect(faceFailureReason("")).toBeNull();
    expect(faceFailureReason(null)).toBeNull();
    expect(faceFailureReason(undefined)).toBeNull();
  });
});

describe("faceVerdict, when the function refused and said why", () => {
  it("tells somebody with no photo exactly that, and does not retry", () => {
    const v = faceVerdict({ status: "bypassed", confidence: 0, reason: "no_photo" }, 1, 3);
    expect(v.proceed).toBe(false);
    expect(v.retry).toBe(false);
    expect(v.message).toMatch(/add your profile photo/i);
    expect(v.message).not.toMatch(/service error|attempt/i);
  });

  it("says the same thing on the last attempt as on the first", () => {
    // Retrying cannot conjure a profile photo, so running out of goes must
    // not quietly let them in flagged for review instead.
    const last = faceVerdict({ status: "bypassed", confidence: 0, reason: "no_photo" }, 3, 3);
    expect(last.proceed).toBe(false);
    expect(last.retry).toBe(false);
    expect(last.message).toMatch(/add your profile photo/i);
  });

  it("names the real problem when the login has no staff record", () => {
    const v = faceVerdict({ status: "bypassed", confidence: 0, reason: "not_staff" }, 1, 3);
    expect(v.proceed).toBe(false);
    expect(v.retry).toBe(false);
    expect(v.message).toMatch(/not linked to a staff record/i);
  });

  it("still lets a verified check-in through, reason or not", () => {
    expect(faceVerdict({ status: "verified", confidence: 91, reason: "no_photo" }, 1, 3).proceed).toBe(true);
  });

  it("leaves a genuine service fault behaving exactly as it did", () => {
    // No reason set - the function was unreachable, or said something new.
    const first = faceVerdict({ status: "bypassed", confidence: 0 }, 1, 3);
    expect(first.retry).toBe(true);
    expect(first.message).toMatch(/service error/i);
    const last = faceVerdict({ status: "bypassed", confidence: 0 }, 3, 3);
    expect(last.proceed).toBe(true);
    expect(last.recordStatus).toBe("bypassed");
  });
});

describe("the check-in hook", () => {
  const hook = () =>
    readFileSync("src/hooks/useMyAttendanceDay.ts", "utf8")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "");

  it("reads the refusal out of the response body", () => {
    // supabase-js puts only the status line on the Error; the reason is in
    // the body, reachable through error.context.
    const src = hook();
    expect(src).toMatch(/const response = \(error as \{ context\?: Response \}\)\?\.context/);
    expect(src).toMatch(/faceFailureReason\(/);
    expect(src).toMatch(/reason: await refusalReason\(error\)/);
  });

  it("does not spend one of their three goes on a refusal", () => {
    expect(hook()).toMatch(/if \(result\.reason\) setAttempt\(attempt\)/);
  });

  it("falls back to the old behaviour when the body cannot be read", () => {
    const fn = hook().split("async function refusalReason")[1].split("export")[0];
    expect(fn).toMatch(/return null/);
    expect(fn).toMatch(/catch \{\s*return null;\s*\}/);
  });
});
