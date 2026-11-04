import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  APPOINTMENT_QUERY_KEYS,
  appointmentChangeKind,
  appointmentEventId,
  canApplyLiveChange,
  type AppointmentChange,
} from "@/lib/liveAppointments";

/** Long enough that a run of front-desk deletions is one refresh, not ten. */
const SETTLE_MS = 1_000;

/**
 * Every subscription gets its own channel name.
 *
 * supabase.channel(topic) hands back an EXISTING channel when one already has
 * that topic (RealtimeClient.channel), and adding a listener to a channel that
 * has already subscribed throws. With one fixed name, the second screen to
 * mount this - the appointment sheet, opening over the list - was handed the
 * list's subscribed channel and brought the whole page down with
 * "cannot add postgres_changes callbacks ... after subscribe()".
 *
 * A counter and a random suffix, read at subscribe time, so two screens, or
 * the same screen mounted twice, can never collide. Two channels on one socket
 * is cheap; each caller debounces, and React Query collapses concurrent
 * refetches of the same key.
 */
let channelSeq = 0;

interface Options {
  /**
   * True while somebody is mid-edit on this screen - a row being edited
   * inline, the booking dialog open. Nothing refreshes while this holds.
   */
  paused?: boolean;
  /** Told about each change, so a screen can react to its own record. */
  onAppointment?: (id: string, kind: AppointmentChange) => void;
}

/**
 * Keep appointments current without anyone pressing refresh.
 *
 * The front desk re-books and cancels all day; a doctor's screen held its data
 * for a minute and refetched on nothing, so she saw none of it until something
 * else happened to reload. One re-booking that way cost a whole consultation -
 * see liveAppointments.ts.
 *
 * Nothing here can blank a screen. It invalidates rather than removing, so the
 * rows already on screen stay on screen while fresh ones are fetched behind
 * them: React Query reports `isLoading` only when a query has no data at all,
 * and this never empties one. A refresh that fails leaves the previous rows
 * exactly where they were, with the page's own notice above them.
 */
export function useLiveAppointments({ paused = false, onAppointment }: Options = {}) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef(false);
  // Read through refs so the subscription is made once and never torn down and
  // rebuilt as a page re-renders.
  const pausedRef = useRef(paused);
  const onAppointmentRef = useRef(onAppointment);
  pausedRef.current = paused;
  onAppointmentRef.current = onAppointment;

  const applyIfAllowed = () => {
    const hidden = typeof document !== "undefined" && document.visibilityState === "hidden";
    if (!canApplyLiveChange({ paused: pausedRef.current, hidden })) return; // held, not dropped
    pendingRef.current = false;
    // Every key that holds appointment data, not just "appointments". React
    // Query matches by prefix, so the dashboard, the patient record and the
    // prescription sheet - which all name their queries differently - were
    // never reached by this and stayed on the old date until a refresh. See
    // APPOINTMENT_QUERY_KEYS.
    for (const key of APPOINTMENT_QUERY_KEYS) {
      queryClient.invalidateQueries({
        queryKey: [key],
        // Only what is actually on screen is re-read. Everything else is marked
        // stale and refreshes the next time it is opened, which costs nothing now.
        refetchType: "active",
      });
    }
  };

  useEffect(() => {
    const schedule = () => {
      pendingRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        applyIfAllowed();
      }, SETTLE_MS);
    };

    // Live updates are a convenience. If realtime cannot start - a blocked
    // websocket, a client change, anything - the page must carry on exactly as
    // it did before this existed, with its data on screen. It must never be
    // able to take a clinic screen down, which is precisely what it did.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`appointments-live-${++channelSeq}-${Math.random().toString(36).slice(2, 8)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, (payload) => {
          const id = appointmentEventId(payload as never);
          if (id) onAppointmentRef.current?.(id, appointmentChangeKind(payload as never));
          schedule();
        })
        .subscribe();
    } catch (err) {
      console.error("Live appointment updates are unavailable", err);
    }

    // Coming back to the tab is the moment to catch up: the app does not
    // refetch on window focus - that was removed as "the app refreshes by
    // itself" - so without this a backgrounded screen would stay behind.
    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingRef.current) applyIfAllowed();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      try {
        if (channel) supabase.removeChannel(channel);
      } catch (err) {
        console.error("Could not close the live appointment channel", err);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The moment the screen is free again, catch up on whatever arrived while it
  // was not.
  useEffect(() => {
    if (!paused && pendingRef.current && !timerRef.current) applyIfAllowed();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paused]);
}
