/**
 * Staff attendance: what the button does, and what a face check means.
 *
 * The decisions live here rather than in the page, because the page would
 * need the camera, storage, an edge function and Supabase all mocked before
 * a single rule could be asserted.
 */

/** A row of attendance_records, as far as these decisions care. */
export interface AttendanceRow {
  check_in_time: string | null;
  check_out_time: string | null;
}

/**
 * The whole row, as it exists after migration 20261102140000.
 *
 * Declared here rather than taken from the generated Supabase types, which
 * are regenerated on sync and do not yet know the four face columns. One
 * named type beats `any` scattered across two pages - when the generated
 * types catch up, this can be swapped for `Tables<"attendance_records">`.
 */
export interface AttendanceRecord extends AttendanceRow {
  id: string;
  staff_id: string;
  date: string;
  status: string | null;
  check_in_photo: string | null;
  check_out_photo: string | null;
  check_in_face_status: string | null;
  check_in_face_confidence: number | null;
  check_out_face_status: string | null;
  check_out_face_confidence: number | null;
  /** {latitude, longitude, accuracy} as the browser reported it, or null when
   *  there was no fix - best-effort, so null is an ordinary outcome. */
  check_in_location: unknown;
  check_out_location: unknown;
  check_in_address: string | null;
  check_out_address: string | null;
}

/** One of the two buttons on the attendance page. */
export interface DayButton {
  label: string;
  disabled: boolean;
}

/**
 * Both buttons, always on screen, as the Bharath Builders app shows them.
 *
 * A single button that swaps its own label between "Start my day" and "End my
 * day" was what shipped first, and the clinic reported that the page had no
 * day-start or day-end option at all. Seeing BOTH, with the one that is not
 * available greyed out and naming what already happened, is what tells
 * somebody at a glance where they are in their day. A control that silently
 * becomes a different control does not.
 */
export function dayButtons(row: AttendanceRow | null | undefined): { start: DayButton; end: DayButton } {
  const checkedIn = !!row?.check_in_time;
  const checkedOut = !!row?.check_out_time;

  return {
    start: {
      label: checkedOut ? "Day Ended" : checkedIn ? "Day Started" : "Start My Day",
      // Once the day has started there is nothing left to start, and a
      // finished day cannot be started again.
      disabled: checkedIn || checkedOut,
    },
    end: {
      label: checkedOut ? "Day Ended" : "End My Day",
      // Nobody ends a day they never started.
      disabled: !checkedIn || checkedOut,
    },
  };
}

/** What the verifier came back with. */
export type FaceStatus = "verified" | "failed" | "bypassed";

/**
 * Why the face check could not answer, when it could not.
 *
 * Separate from FaceStatus on purpose. FaceStatus is what gets WRITTEN on the
 * attendance row and the CHECK constraint attendance_face_status_values
 * allows exactly three values; none of these ever reaches the row, because an
 * attempt that fails for one of them never proceeds. So the reason rides
 * alongside the status rather than widening it.
 *
 * It exists because 17 of the clinic's 18 active staff have no profile photo
 * and the app told them all the same thing: "Face verification service
 * error. Attempt 1/3. Please try again." Three selfies later they were let in
 * flagged for review, none the wiser about what was actually wrong.
 */
export type FaceFailureReason = "no_photo" | "not_staff";
export interface FaceResult {
  status: FaceStatus;
  confidence: number;
  /** Set only when the function refused and said why. */
  reason?: FaceFailureReason | null;
}

/**
 * The function's own words, turned into a reason.
 *
 * Matched on the message verify-face-match actually sends rather than on the
 * HTTP status, because 400 covers both "set your profile photo" and "that
 * photo is not yours" and only one of those is the person's to fix. Anything
 * unrecognised returns null and is treated exactly as before - a service
 * fault, retried, and eventually allowed through flagged. A new error string
 * must not strand somebody at the door.
 */
export function faceFailureReason(message: string | null | undefined): FaceFailureReason | null {
  const text = String(message ?? "").toLowerCase();
  if (!text) return null;
  if (text.includes("profile photo")) return "no_photo";
  if (text.includes("no staff record")) return "not_staff";
  return null;
}

/** Attempts a person gets before they are told to find an admin, when the
 *  clinic has not set its own. The reference hardcodes this; here it is
 *  attendance_config.face_max_attempts. */
export const MAX_FACE_ATTEMPTS = 3;

/** The settings an admin can change. */
export interface AttendanceConfig {
  require_selfie: boolean;
  capture_location: boolean;
  face_match_threshold: number;
  face_max_attempts: number;
  /** Corrections one person may ask for against any one month. 0 = no limit. */
  regularisation_monthly_limit: number;
}

/** What the app falls back to before the settings row has loaded - the same
 *  values the migration seeds, so behaviour never changes under somebody
 *  mid-check-in. */
export const DEFAULT_ATTENDANCE_CONFIG: AttendanceConfig = {
  require_selfie: true,
  capture_location: true,
  face_match_threshold: 75,
  face_max_attempts: MAX_FACE_ATTEMPTS,
  // 0 is "no limit", which is what there was before the setting existed.
  regularisation_monthly_limit: 0,
};

export interface FaceVerdict {
  /** Save the attendance row? */
  proceed: boolean;
  /** Let them try again? */
  retry: boolean;
  /** What goes in the toast. Empty when it simply worked. */
  message: string;
  /** Recorded on the row, so an admin can see how it was decided. */
  recordStatus: FaceStatus;
}

/**
 * What to do with a face comparison.
 *
 * The clinic's rule is "no match, no attendance", and a real mismatch is
 * exactly that - blocked, with the attempt counted.
 *
 * A SERVICE ERROR is not a mismatch, and the two must not be collapsed. The
 * verifier answers "bypassed" when the AI gateway failed, the images could
 * not be fetched, or the key is missing; nothing was compared at all. The
 * reference app this follows treated that as confidence 0, told people their
 * face did not match, and after three tries locked them out of ending their
 * day - and then had to fix it. So a service error gets the same retries, and
 * when those are gone the attendance is SAVED and flagged `bypassed` for an
 * admin to look at. A broken gateway must never cost somebody their day's
 * attendance; a wrong face must always cost them the check-in.
 *
 * @param attempt 1-based: the attempt that just happened.
 */
export function faceVerdict(
  result: FaceResult,
  attempt: number,
  maxAttempts: number = MAX_FACE_ATTEMPTS,
): FaceVerdict {
  // A nonsense setting must not hand somebody infinite goes, nor zero.
  const cap = Number.isFinite(maxAttempts) && maxAttempts >= 1 ? Math.floor(maxAttempts) : MAX_FACE_ATTEMPTS;
  if (result.status === "verified") {
    return { proceed: true, retry: false, message: "", recordStatus: "verified" };
  }

  const last = attempt >= cap;

  // Asked and answered: the service worked, and the answer was that there is
  // nothing to compare against. Retrying cannot change it, so it does not
  // count as an attempt and does not pretend to be a fault.
  if (result.reason === "no_photo") {
    return {
      proceed: false,
      retry: false,
      message:
        "Add your profile photo before checking in - ask an admin to set it on your staff record.",
      recordStatus: "bypassed",
    };
  }
  if (result.reason === "not_staff") {
    return {
      proceed: false,
      retry: false,
      message: "This login is not linked to a staff record. Ask an admin to link it.",
      recordStatus: "bypassed",
    };
  }

  if (result.status === "bypassed") {
    if (!last) {
      return {
        proceed: false,
        retry: true,
        message: `Face verification service error. Attempt ${attempt}/${cap}. Please try again.`,
        recordStatus: "bypassed",
      };
    }
    // Out of retries on a service fault - record it rather than strand them.
    return {
      proceed: true,
      retry: false,
      message: "Face verification is unavailable. Your attendance is recorded and flagged for review.",
      recordStatus: "bypassed",
    };
  }

  // A genuine mismatch. Never proceeds, at any attempt.
  if (!last) {
    return {
      proceed: false,
      retry: true,
      message: `Face verification failed - this does not match your profile photo (${result.confidence}% confidence). Attempt ${attempt}/${cap}. Please try again.`,
      recordStatus: "failed",
    };
  }
  return {
    proceed: false,
    retry: false,
    message: `Face verification failed after ${cap} attempts. Your face does not match the registered profile photo. Please contact your admin.`,
    recordStatus: "failed",
  };
}

/**
 * Hours between checking in and out, to two decimals.
 *
 * Null until both ends exist. A check-out before the check-in is a clock or
 * data fault, not negative work, so it reads as 0 rather than a minus figure
 * in the admin's totals.
 */
export function hoursWorked(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
): number | null {
  const a = toDate(checkIn);
  const b = toDate(checkOut);
  if (!a || !b) return null;
  const hours = (b.getTime() - a.getTime()) / 3_600_000;
  return hours <= 0 ? 0 : Math.round(hours * 100) / 100;
}

function toDate(value: string | Date | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Where a check-in photo is stored.
 *
 * Under the staff member's own id, because the bucket policy lets a person
 * write only inside their own folder - the path IS the permission.
 */
export function attendancePhotoPath(
  staffId: string,
  kind: "check_in" | "check_out",
  now: Date = new Date(),
): string {
  const p2 = (n: number) => String(n).padStart(2, "0");
  const date = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`;
  const unique = Math.random().toString(36).slice(2, 8);
  return `${staffId}/${date}_${kind}_${now.getTime()}-${unique}.jpg`;
}

/**
 * Where somebody is in their working day.
 *
 * dayButtons() already answers "which control is live". This answers "what
 * should this look like", which is a different question: the dashboard card
 * greets you, counts up, or congratulates you depending on the phase, and
 * deriving that from two disabled flags at the call site is how the two
 * surfaces would start to disagree.
 */
export type DayPhase = "not_started" | "running" | "complete";

export function dayPhase(row: AttendanceRow | null | undefined): DayPhase {
  if (row?.check_out_time) return "complete";
  if (row?.check_in_time) return "running";
  return "not_started";
}

/**
 * "3h 42m" - how long the day has run so far, or ran in total.
 *
 * Deliberately NOT hoursWorked(): that returns 2.83 for an admin's totals
 * column, which is the right answer there and an unreadable one on a card
 * somebody glances at between patients.
 *
 * While the day is still open this measures up to `now`, so the card can
 * tick. Once it is closed `now` is ignored and the figure is fixed, or a
 * card left open overnight would keep counting a day that ended at six.
 *
 * Null when the day has not started. A check-out before the check-in is a
 * clock fault rather than negative work, so it reads "0m" - the same choice
 * hoursWorked() makes, for the same reason.
 */
export function elapsedLabel(
  checkIn: string | Date | null | undefined,
  checkOut: string | Date | null | undefined,
  now: Date = new Date(),
): string | null {
  const start = toDate(checkIn);
  if (!start) return null;
  const end = toDate(checkOut) ?? now;

  const ms = end.getTime() - start.getTime();
  const totalMinutes = ms <= 0 ? 0 : Math.floor(ms / 60_000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * "Good morning" / "Good afternoon" / "Good evening".
 *
 * Boundaries are local-clock, which is the point: the clinic runs on
 * Asia/Kolkata and a greeting computed in UTC would wish a receptionist
 * good evening while she is unlocking the front door.
 */
export function greeting(at: Date = new Date()): string {
  const h = at.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/**
 * The longest edge an attendance photo is stored at.
 *
 * Only attendance. Clinical photography passes no cap and keeps its full
 * 1920x1080, for the reasons set out in src/lib/cameraStream.ts.
 *
 * An attendance selfie is compared against a baseline face and then shown as
 * an 80x80 thumbnail in the admin list - 800px is generous for both. What it
 * buys is the upload: the clinic's staff check in on their phones at the
 * door, frequently on mobile data, and somebody who falls back to their own
 * camera app was sending a 12MP, 3-5MB frame. That is tens of seconds of
 * standing still, and on an older iPhone it is more canvas than Safari will
 * allocate - at which point the stamp throws and the photo uploads with no
 * caption at all, which defeats the point of taking it.
 */
export const ATTENDANCE_PHOTO_MAX_EDGE = 800;
