import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  computeJourneyAnalytics,
  type AnalyticsAppointment,
  type AnalyticsEnrollment,
  type AnalyticsInvoice,
  type AnalyticsMessage,
} from "@/lib/comms/journeyAnalytics";

const PAGE = 1000;
const MAX_PAGES = 100;

// Reads one table in pages of 1000 (the API limit) until exhausted.
async function fetchAllPaged<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await build(page * PAGE, page * PAGE + PAGE - 1);
    if (error) throw error;
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export function useJourneyAnalytics(journeyId: string, range: { from: Date; to: Date } | undefined, live: boolean) {
  const refetchInterval = live ? 5000 : false;

  const messages = useQuery({
    queryKey: ["comms-journey-analytics-messages", journeyId],
    enabled: !!journeyId,
    refetchInterval,
    queryFn: () =>
      fetchAllPaged<AnalyticsMessage>((from, to) =>
        supabase
          .from("comms_journey_message_log")
          .select("id, patient_id, node_id, status, delivery_status, error_code, error_message, sent_at")
          .eq("journey_id", journeyId)
          .order("sent_at", { ascending: false })
          .range(from, to)
      ),
  });

  const enrollments = useQuery({
    queryKey: ["comms-journey-analytics-enrollments", journeyId],
    enabled: !!journeyId,
    refetchInterval,
    queryFn: () =>
      fetchAllPaged<AnalyticsEnrollment>((from, to) =>
        supabase
          .from("comms_journey_enrollments")
          .select("id, patient_id, status, enrolled_at")
          .eq("journey_id", journeyId)
          .order("id")
          .range(from, to)
      ),
  });

  // Patients reached by this journey, for appointment / invoice attribution.
  const patientIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of enrollments.data ?? []) ids.add(e.patient_id);
    for (const m of messages.data ?? []) if (m.patient_id) ids.add(m.patient_id);
    return Array.from(ids).sort();
  }, [enrollments.data, messages.data]);
  const idsKey = patientIds.join(",");

  const conversions = useQuery({
    queryKey: ["comms-journey-analytics-conversions", journeyId, idsKey.length, patientIds[0], patientIds[patientIds.length - 1]],
    enabled: patientIds.length > 0,
    queryFn: async () => {
      const appointments: AnalyticsAppointment[] = [];
      const invoices: AnalyticsInvoice[] = [];
      for (let i = 0; i < patientIds.length; i += 200) {
        const chunk = patientIds.slice(i, i + 200);
        const [a, inv] = await Promise.all([
          supabase.from("appointments").select("patient_id, created_at").in("patient_id", chunk),
          supabase.from("invoices").select("patient_id, created_at, paid_amount").in("patient_id", chunk),
        ]);
        if (a.error) throw a.error;
        if (inv.error) throw inv.error;
        appointments.push(...(a.data ?? []));
        invoices.push(...(inv.data ?? []));
      }
      return { appointments, invoices };
    },
  });

  const result = useMemo(
    () =>
      computeJourneyAnalytics({
        messages: messages.data ?? [],
        enrollments: enrollments.data ?? [],
        appointments: conversions.data?.appointments ?? [],
        invoices: conversions.data?.invoices ?? [],
        range,
      }),
    [messages.data, enrollments.data, conversions.data, range]
  );

  return { ...result, isLoading: messages.isLoading || enrollments.isLoading, isError: messages.isError || enrollments.isError };
}
