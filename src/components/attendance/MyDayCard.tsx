import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { ArrowRight, CheckCircle2, Clock, LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useMyAttendanceToday } from "@/hooks/useMyAttendanceToday";
import { greeting } from "@/lib/attendance";
import { hoursLabel } from "@/lib/attendanceHistory";

/**
 * Where the working day stands, and the way into it.
 *
 * This card used to take the selfie itself. The clinic's complaint then was
 * the walk - Employees > Attendance > Start My Day, three navigations before
 * a receptionist had clocked in at nine in the morning - so both buttons
 * were put on the page everybody lands on.
 *
 * They have since asked for the opposite: the buttons open Employees > My
 * Attendance, and the day is marked there. Both were put side by side and
 * this is the one chosen, so the camera, the face match and the retry count
 * have gone back to the page that owns them, and there is now exactly one
 * place in the app where attendance is recorded.
 *
 * What stays is the answer to "am I clocked in?", which the dashboard should
 * give without a tap: the phase, the two times, today's hours and the live
 * counter. That is the "same thing can be shown in dashboard" half.
 *
 * Reading only - useMyAttendanceToday, not useMyAttendanceDay. Mounting the
 * acting hook here would bring the camera state and the staff-photo query
 * onto a page that can no longer use either.
 *
 * Nothing else on the dashboard moves. The card sits above the KPI row and
 * takes one line of vertical space when the day is done.
 *
 * Motion is transform and opacity only, with a reduced-motion fallback on
 * every animated element, per the house rule: this screen is already dense
 * and already fetching, and a card that janks while the KPIs load is worse
 * than a still one.
 */
const TICK_MS = 20_000;

export function MyDayCard() {
  const { staffProfile } = useAuth();
  const { record, phase, buttons, closedToday, elapsed, hours } = useMyAttendanceToday();

  const reduced = useReducedMotion();

  // The counter reads in minutes, so a per-second timer would redraw sixty
  // times for every change anyone can see. Twenty seconds keeps the minute
  // flipping promptly without the dashboard re-rendering in a loop.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (phase !== "running") return;
    const id = setInterval(() => setNow(new Date()), TICK_MS);
    return () => clearInterval(id);
  }, [phase]);

  // No staff record means no attendance to take - a patient-portal login, or
  // somebody whose staff row has not been linked yet. Showing them two dead
  // buttons on the dashboard would be worse than showing nothing.
  if (!staffProfile?.id) return null;

  const elapsedText = elapsed(now);

  // Semantic tokens only, at low alpha: the dashboard behind this is already
  // full of colour and the card has to sit above it, not shout over it.
  const accent =
    phase === "running"
      ? { bar: "bg-success", wash: "bg-gradient-to-r from-success/[0.07] to-transparent" }
      : phase === "complete"
        ? { bar: "bg-success/40", wash: "" }
        : { bar: "bg-primary", wash: "bg-gradient-to-r from-primary/[0.06] to-transparent" };
  const rise = reduced ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <motion.section
      {...rise}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={`glass-surface relative mb-4 overflow-hidden rounded-xl border p-4 pl-5 sm:p-5 sm:pl-6 ${accent.wash}`}
      aria-label="My working day"
    >
      {/* A 3px spine in the phase's colour. Colour only - no motion - so it
          reads instantly on a dense dashboard without competing with the
          KPI row underneath for attention. */}
      <span aria-hidden className={`absolute inset-y-0 left-0 w-[3px] ${accent.bar}`} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">
            {greeting()}{staffProfile.firstName ? `, ${staffProfile.firstName}` : ""}
          </p>

          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={phase}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2"
            >
              {phase === "running" && (
                <span className="relative flex h-2.5 w-2.5 shrink-0" aria-hidden>
                  {!reduced && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
                  )}
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
                </span>
              )}
              {phase === "complete" && <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />}

              <h2 className="flex flex-wrap items-baseline gap-x-2 font-display text-lg font-semibold">
                {phase === "not_started" && "Your day hasn't started"}
                {phase === "running" && (
                  <>Working<span className="text-2xl tabular-nums leading-none text-success">{elapsedText}</span></>
                )}
                {phase === "complete" && (
                  <>Day complete<span className="text-2xl tabular-nums leading-none">{elapsedText}</span></>
                )}
              </h2>
            </motion.div>
          </AnimatePresence>

          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <LogIn className="h-3 w-3" />
              Started {record?.check_in_time ? format(new Date(record.check_in_time), "h:mm a") : "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <LogOut className="h-3 w-3" />
              Ended {record?.check_out_time ? format(new Date(record.check_out_time), "h:mm a") : "—"}
            </span>
            {hours !== null && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {hoursLabel(hours)} today
              </span>
            )}
            {closedToday && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {closedToday === "Week off" ? "Week off" : closedToday} — you can still record it
              </span>
            )}
          </div>
        </div>

        {/* Full-width and stacked on a phone, inline from sm up. Two
            reasons, both from watching it at 375px:

            1. These were 36px tall. This is the control the clinic presses
               twice a day on a phone, and it was the smallest thing on the
               card.
            2. The row used to re-wrap mid-check-in. "Start My Day" and
               "End My Day" fit side by side, but the busy label is
               "Verifying face match…", which does not - so the moment
               somebody pressed, the buttons jumped to a second line and
               took History with them. Giving each its own row on mobile
               means the label can grow without moving anything. */}
        <div className="flex w-full shrink-0 flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:items-center">
          {/* Both buttons while there is something to press, exactly as
              /attendance shows them: the greyed-out one names what already
              happened, which is what tells somebody at a glance where they
              are in their day. Once the day is complete the headline already
              says "Day complete - 9h 28m", so a pair of dead buttons both
              reading "Day Ended" would be noise taking up the strip. */}
          {/* Links, not actions. The greyed-out one still names what has
              already happened, which is what tells somebody at a glance
              where they are in their day - a disabled anchor is not a
              thing, so the spent one renders as a disabled button. */}
          {phase !== "complete" && (<>
          {buttons.start.disabled ? (
            <Button type="button" size="sm" disabled data-testid="dash-start-my-day"
              className="min-h-11 w-full gap-2 sm:w-auto">
              <LogIn className="h-4 w-4" />{buttons.start.label}
            </Button>
          ) : (
            <Button asChild size="sm" data-testid="dash-start-my-day"
              className="min-h-11 w-full gap-2 transition-transform hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none sm:w-auto">
              <Link to="/attendance"><LogIn className="h-4 w-4" />{buttons.start.label}</Link>
            </Button>
          )}
          {buttons.end.disabled ? (
            <Button type="button" size="sm" variant="outline" disabled data-testid="dash-end-my-day"
              className="min-h-11 w-full gap-2 sm:w-auto">
              <LogOut className="h-4 w-4" />{buttons.end.label}
            </Button>
          ) : (
            <Button asChild size="sm" variant="outline" data-testid="dash-end-my-day"
              className="min-h-11 w-full gap-2 transition-transform hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none sm:w-auto">
              <Link to="/attendance"><LogOut className="h-4 w-4" />{buttons.end.label}</Link>
            </Button>
          )}
          </>)}
          <Button asChild size="sm" variant="ghost" className="min-h-11 gap-1 text-xs text-muted-foreground sm:min-h-0">
            <Link to="/attendance">History<ArrowRight className="h-3 w-3" /></Link>
          </Button>
        </div>
      </div>

    </motion.section>
  );
}
