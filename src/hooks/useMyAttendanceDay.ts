import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  attendancePhotoPath, faceFailureReason, faceVerdict,
  type FaceFailureReason, type FaceResult,
} from "@/lib/attendance";
import { stampPhotoOrOriginal } from "@/lib/stampPhoto";
import { ATTENDANCE_PHOTO_MAX_EDGE } from "@/lib/attendance";
import { currentPosition, reverseGeocode, type Fix } from "@/lib/geo";
import { useMyAttendanceToday, attendanceToday } from "@/hooks/useMyAttendanceToday";
import { uploadStaffPhoto } from "@/lib/staffPhoto";

/**
 * What the edge function said, when it said no.
 *
 * supabase-js hands back a FunctionsHttpError whose `context` is the raw
 * Response; the message it puts on the Error object is only the status line,
 * so the reason has to be read out of the body. Anything unreadable returns
 * null and the caller falls back to the service-fault path it always had.
 */
async function refusalReason(error: unknown): Promise<FaceFailureReason | null> {
  const response = (error as { context?: Response })?.context;
  if (!response || typeof response.json !== "function") return null;
  try {
    const body = await response.clone().json();
    return faceFailureReason((body as { error?: string } | null)?.error);
  } catch {
    return null;
  }
}

/**
 * One person's working day: the state of it, and the two acts that change it.
 *
 * This lives in a hook because the clinic asked for the same two buttons on
 * the dashboard as well as on /attendance - walking to Employees > Attendance
 * to press Start My Day was a detour at nine in the morning. The obvious way
 * to add them would be a second, simpler check-in on the dashboard, and that
 * is exactly the trap: the face check, the retry count, the location capture,
 * the photo stamp, the bypass-on-service-failure rule and the
 * register-your-face-then-carry-on detour would all have to be duplicated,
 * and the copies would drift. The reference app has three copies of its
 * week-off rule and they disagree; this is the same mistake one layer up.
 *
 * So both surfaces call this, and both render the SAME CameraDialog props.
 * They differ only in how they draw the result.
 *
 * Because both use the same react-query key, starting the day on the
 * dashboard updates the attendance page without either knowing about the
 * other.
 */
const today = attendanceToday;

export type DayStep = "idle" | "registering" | "locating" | "photo" | "verifying" | "saving";
export type DayKind = "check_in" | "check_out";

export function useMyAttendanceDay() {
  const { staffProfile } = useAuth();
  const qc = useQueryClient();
  const staffId = staffProfile?.id;

  const [cameraOpen, setCameraOpen] = useState(false);
  const [step, setStep] = useState<DayStep>("idle");
  const [attempt, setAttempt] = useState(0);
  /** Which end of the day the open camera is for. */
  const [mode, setMode] = useState<DayKind>("check_in");
  /**
   * Set when the camera is collecting a FACE REGISTRATION rather than an
   * attendance selfie. Holds what they pressed, so that once the photo is
   * saved the check-in continues by itself - the reference's pendingAction.
   */
  const [registering, setRegistering] = useState<null | DayKind>(null);

  /**
   * The location lookup, started early and awaited late.
   *
   * It used to run at the top of submit(), in band: up to 11s for a
   * high-accuracy fix (10s timeout plus a 1s safety timer) and then up to 4s
   * more to turn it into a street address, all AFTER the selfie was taken
   * and before the upload had begun. On a phone at the clinic door that was
   * most of a 20-30 second wait staring at "Getting location…".
   *
   * The several seconds somebody spends framing and taking a selfie is dead
   * time for the GPS, so the request now starts the moment they press, and
   * submit() awaits a promise that has usually already settled.
   *
   * It also puts iOS's location prompt where it belongs. Asked from inside
   * submit(), the sheet appeared after the camera had closed and the photo
   * was already taken - two system prompts at two unrelated moments.
   */
  const locating = useRef<Promise<{ fix: Fix | null; address: string | null }> | null>(null);

  const beginLocating = () => {
    if (!config.capture_location) { locating.current = null; return; }
    locating.current = (async () => {
      const fix = await currentPosition();
      const address = fix ? await reverseGeocode(fix.latitude, fix.longitude) : null;
      return { fix, address };
    })();
  };

  // The reading half, shared with the dashboard card so there is one query
  // and one idea of "today". Everything below this line is the acting half.
  const { record, phase, buttons, config, closedToday, hours, elapsed, refetch } = useMyAttendanceToday();

  const { data: staff, refetch: refetchStaff } = useQuery({
    queryKey: ["staff", "photo", staffId],
    enabled: !!staffId,
    queryFn: async () => {
      const { data, error } = await supabase.from("staff").select("photo_url").eq("id", staffId!).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const hasPhoto = !!String(staff?.photo_url ?? "").trim();
  const busy = step !== "idle";

  const stepLabel =
    step === "locating" ? "Getting location…"
    : step === "registering" || step === "photo" ? "Uploading photo…"
    : step === "verifying" ? "Verifying face match…"
    : step === "saving" ? "Saving attendance…"
    : "";

  /**
   * Pressing Start My Day or End My Day.
   *
   * With no photo on file the camera opens to REGISTER the face first; the
   * action is remembered and resumed the moment it is saved.
   */
  const press = (kind: DayKind) => {
    setMode(kind);
    setAttempt(0);
    // Starts now so it is ready by the time the selfie is taken.
    beginLocating();
    // Selfie switched off in settings: record the day without a camera, a
    // photo or a face call, and mark it unverified so it is never mistaken
    // for a checked one. The reference's doDirectAttendance.
    if (!config.require_selfie) {
      void submit(null, kind);
      return;
    }
    setRegistering(hasPhoto ? null : kind);
    setCameraOpen(true);
  };

  /** The face-registration half: save the photo, then carry straight on. */
  const register = async (file: File, kind: DayKind) => {
    if (!staffId) return;
    setStep("registering");
    try {
      await uploadStaffPhoto(staffId, file);
      await refetchStaff();
      setRegistering(null);
      toast.success("Face registered. Now take your selfie.");
      setStep("idle");
      // Straight back into the camera for the action they actually pressed.
      setMode(kind);
      setCameraOpen(true);
    } catch (e) {
      setStep("idle");
      toast.error(e instanceof Error ? e.message : "Could not save your photo");
    }
  };

  /**
   * The whole check-in, from a captured selfie to a saved row.
   *
   * Order is deliberate: the photo is stamped and stored BEFORE the face is
   * checked, because the verifier reads it out of storage - and because a
   * refused attempt should still leave the photo behind for an admin to look
   * at when somebody says the check was wrong.
   */
  const submit = async (file: File | null, kind: DayKind) => {
    if (!staffId) return;
    const now = new Date();
    const thisAttempt = attempt + 1;
    setAttempt(thisAttempt);

    try {
      // Where they are. Best-effort throughout: a denied permission or a
      // phone that cannot see the sky must never cost somebody their day.
      //
      // Normally already settled - it was started when they pressed - so
      // this costs nothing. Started here only on the path where press()
      // never ran one, which is the selfie-disabled one-tap check-in.
      let fix: Fix | null = null;
      let address: string | null = null;
      if (config.capture_location) {
        if (!locating.current) beginLocating();
        setStep("locating");
        const located = await locating.current;
        fix = located?.fix ?? null;
        address = located?.address ?? null;
      }

      let path: string | null = null;
      if (file) {
        setStep("photo");
        // Never costs the check-in: on any failure the unstamped photo is used.
        const stamped = await stampPhotoOrOriginal(file, {
          at: now,
          address,
          lat: fix?.latitude ?? null,
          lng: fix?.longitude ?? null,
          maxEdge: ATTENDANCE_PHOTO_MAX_EDGE,
        });
        path = attendancePhotoPath(staffId, kind, now);
        const { error: upErr } = await supabase.storage
          .from("attendance-photos").upload(path, stamped, { contentType: "image/jpeg" });
        if (upErr) throw upErr;
      }

      setStep("verifying");
      // The selfie's PATH, not a URL: the function looks up the caller's own
      // baseline photo server-side, so nobody can ask it to compare a selfie
      // against somebody else's face.
      let result: FaceResult = { status: "bypassed", confidence: 0 };
      if (path) try {
        const { data, error } = await supabase.functions.invoke("verify-face-match", {
          body: { selfie_path: path },
        });
        if (!error && data) {
          result = {
            status: (data.status as FaceResult["status"]) ?? "bypassed",
            confidence: Number(data.confidence) || 0,
          };
        } else if (error) {
          // The function refused and said why. Every non-2xx used to land in
          // the same bucket as an unreachable service, so somebody with no
          // profile photo - 17 of the 18 active staff - was told three times
          // that the service was broken. Read the body and say the real thing.
          result = { status: "bypassed", confidence: 0, reason: await refusalReason(error) };
        }
      } catch {
        // Unreachable function is a service fault, not a mismatch.
        result = { status: "bypassed", confidence: 0 };
      }

      const verdict = faceVerdict(result, thisAttempt, config.face_max_attempts);
      if (!verdict.proceed) {
        // A refusal the person cannot retry their way out of does not spend
        // one of their goes: add the photo, come back, and all three are there.
        if (result.reason) setAttempt(attempt);
        setStep("idle");
        toast.error(verdict.message, { duration: 8000 });
        if (verdict.retry) { setMode(kind); setCameraOpen(true); }
        return;
      }

      setStep("saving");
      let photoRef: string | null = null;
      if (path) {
        const { data: signed } = await supabase.storage
          .from("attendance-photos").createSignedUrl(path, 60 * 60 * 24 * 365);
        photoRef = signed?.signedUrl ?? path;
      }

      // The caption is burned into the photo; these are the same facts in a
      // form a query can reach. The reference declares these columns and
      // never writes them, so its admin screen only ever shows coordinates.
      if (kind === "check_in") {
        const { error } = await supabase.from("attendance_records").insert({
          staff_id: staffId, date: today(), check_in_time: now.toISOString(),
          check_in_photo: photoRef, check_in_face_status: verdict.recordStatus,
          check_in_face_confidence: result.confidence, status: "present",
          check_in_location: fix, check_in_address: address,
        } as never);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("attendance_records").update({
          check_out_time: now.toISOString(), check_out_photo: photoRef,
          check_out_face_status: verdict.recordStatus,
          check_out_face_confidence: result.confidence,
          check_out_location: fix, check_out_address: address,
        } as never).eq("id", record!.id);
        if (error) throw error;
      }

      setAttempt(0);
      await refetch();
      void qc.invalidateQueries({ queryKey: ["dashboard-attendance"] });
      toast.success(
        verdict.message || (kind === "check_in" ? "Your day has started." : "Your day is recorded."),
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not record attendance");
    } finally {
      setStep("idle");
    }
  };

  /**
   * Exactly the props both surfaces hand to <CameraDialog>. Returned as one
   * object rather than five loose values so the two cannot be wired up
   * differently - a dashboard check-in opening the rear camera with no face
   * guide would be a different check-in.
   */
  const cameraProps = {
    open: cameraOpen,
    onOpenChange: setCameraOpen,
    title:
      registering ? "Register your face"
      : mode === "check_out" ? "Selfie to end your day"
      : "Selfie to start your day",
    defaultFacing: "user" as const,
    faceGuide: true,
    // A check-in must be a photo taken now. Without this the gallery route
    // let somebody submit an existing selfie, which `submit` then stamped
    // with the current time and the clinic's address - a caption asserting a
    // time and place the photo was never taken at - and the face match
    // passed, because it really is their face.
    liveOnly: true,
    onCapture: (file: File) => {
      setCameraOpen(false);
      const pending = registering;
      if (pending) void register(file, pending);
      else void submit(file, mode);
    },
  };

  return {
    record,
    phase,
    buttons,
    busy,
    mode,
    step,
    stepLabel,
    attempt,
    hasPhoto,
    config,
    closedToday,
    press,
    cameraProps,
    /** Two decimals, for totals. */
    hours,
    /** "3h 42m", for reading at a glance. */
    elapsed,
  };
}
