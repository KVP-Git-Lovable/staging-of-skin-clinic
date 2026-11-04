import { format } from "date-fns";
import { CalendarCheck, Camera, CheckCircle2, Clock, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CameraDialog } from "@/components/shared/CameraDialog";
import { MAX_FACE_ATTEMPTS } from "@/lib/attendance";
import { useMyAttendanceDay } from "@/hooks/useMyAttendanceDay";

/**
 * Starting and ending a working day.
 *
 * ONE person's own day, and nothing else. No staff list, no settings, and no
 * link to them either - everyone's attendance and the policy live in
 * Admin > Attendance. Both have been on this page at some point and both
 * were wrong here: this is the screen somebody opens to start a shift.
 *
 * Both buttons are always on screen, as the Bharath Builders app shows them,
 * with the unavailable one greyed out and naming what already happened. The
 * first version had a single button that swapped its own label, and the
 * clinic reported the page had no day-start or day-end option at all.
 *
 * Somebody with no profile photo registers their face HERE and carries
 * straight on into the action they pressed. Sending them to /profile is a
 * dead end at nine in the morning when they are trying to start work.
 *
 * The decisions - which button is live, what a face result means - live in
 * src/lib/attendance.ts so they can be tested without a camera, storage and
 * an edge function all mocked.
 */
export default function Attendance() {
  const {
    record, buttons, busy, mode, stepLabel, attempt,
    hasPhoto, config, closedToday, press, cameraProps, hours,
  } = useMyAttendanceDay();

  return (
    <div className="p-4 md:p-6 space-y-5 max-w-2xl">
      <header className="flex items-center gap-2">
        <CalendarCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-semibold font-display">Attendance</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{format(new Date(), "EEEE, d MMMM yyyy")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <Slot label="Started" time={record?.check_in_time} status={record?.check_in_face_status} />
            <Slot label="Ended" time={record?.check_out_time} status={record?.check_out_face_status} />
          </div>
          {hours !== null && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Clock className="h-4 w-4" />{hours} hours recorded
            </p>
          )}

          {/* Both, always. The greyed-out one names what already happened,
              which is what tells somebody where they are in their day.

              Stacked full-width on a phone. `flex-1 sm:flex-none` gave each
              button ~162px at 375px, which is narrower than the busy label
              "Verifying face match…" needs with whitespace-nowrap - so the
              row collapsed from side-by-side to stacked and back again on
              every single press. Own row each, and the label can say what
              it likes. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Button
              type="button"
              className="min-h-11 w-full sm:w-auto"
              disabled={busy || buttons.start.disabled}
              onClick={() => press("check_in")}
              data-testid="start-my-day"
            >
              {busy && mode === "check_in"
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{stepLabel}</>
                : <><Camera className="h-4 w-4 mr-2" />{buttons.start.label}</>}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-full sm:w-auto"
              disabled={busy || buttons.end.disabled}
              onClick={() => press("check_out")}
              data-testid="end-my-day"
            >
              {busy && mode === "check_out"
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />{stepLabel}</>
                : <><Camera className="h-4 w-4 mr-2" />{buttons.end.label}</>}
            </Button>
          </div>

          {buttons.start.disabled && buttons.end.disabled && (
            <p className="text-sm flex items-center gap-2 text-success">
              <CheckCircle2 className="h-4 w-4" />Your day is complete. See you tomorrow.
            </p>
          )}

          {/* Labelling, not blocking: people do work on days off, and a doctor
              coming in on a Sunday for one procedure still has to record it. */}
          {closedToday && (
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <CalendarCheck className="h-4 w-4" />
              Today is {closedToday === "Week off" ? "a week off" : closedToday}. You can still record your day.
            </p>
          )}

          {!hasPhoto && config.require_selfie && (
            <p className="text-xs text-muted-foreground">
              You have no photo on file yet. The first time you press a button above you will be
              asked to take one — your selfie is matched against it each day.
            </p>
          )}

          {attempt > 0 && attempt < MAX_FACE_ATTEMPTS && (
            <p className="text-xs text-muted-foreground">
              Attempt {attempt} of {MAX_FACE_ATTEMPTS}. Face a window and look straight at the camera.
            </p>
          )}
        </CardContent>
      </Card>

      <CameraDialog {...cameraProps} />
    </div>
  );
}

function Slot({ label, time, status }: { label: string; time?: string | null; status?: string | null }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium">{time ? format(new Date(time), "h:mm a") : "—"}</p>
      {status && <FaceBadge status={status} />}
    </div>
  );
}

/**
 * Three outcomes, shown as three different things - a service fault must not
 * look like a failed match.
 */
export function FaceBadge({ status }: { status: string }) {
  if (status === "verified") {
    return <Badge variant="outline" className="mt-1 gap-1 text-success border-success/40"><ShieldCheck className="h-3 w-3" />Face verified</Badge>;
  }
  if (status === "failed") {
    return <Badge variant="outline" className="mt-1 gap-1 text-destructive border-destructive/40"><ShieldAlert className="h-3 w-3" />Face not matched</Badge>;
  }
  return <Badge variant="outline" className="mt-1 gap-1 text-muted-foreground"><ShieldAlert className="h-3 w-3" />Not checked</Badge>;
}
