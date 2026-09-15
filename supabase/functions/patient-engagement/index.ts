import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { patientIds } = await req.json();
    if (!patientIds || !Array.isArray(patientIds) || patientIds.length === 0) {
      return new Response(JSON.stringify({ error: "patientIds array required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all data in parallel
    // Fetch completed appointments separately for last visit date
    const [aptsRes, procsRes, invoicesRes, patientsRes] = await Promise.all([
      supabase.from("appointments").select("id, patient_id, status, start_time").in("patient_id", patientIds),
      supabase.from("procedures").select("id, patient_id, service_name, status").in("patient_id", patientIds),
      supabase.from("invoices").select("id, patient_id, total_amount, status").in("patient_id", patientIds),
      supabase.from("patients").select("id, created_at").in("id", patientIds),
    ]);

    const appointments = aptsRes.data || [];
    const procedures = procsRes.data || [];
    const invoices = invoicesRes.data || [];
    const patients = patientsRes.data || [];

    const now = Date.now();
    const results: Record<string, any> = {};

    for (const pid of patientIds) {
      const patientApts = appointments.filter((a) => a.patient_id === pid);
      const patientProcs = procedures.filter((p) => p.patient_id === pid);
      const patientInvs = invoices.filter((i) => i.patient_id === pid);
      const patientRecord = patients.find((p) => p.id === pid);

      // --- Visit Frequency (30%) ---
      const totalApts = patientApts.length;
      const completedApts = patientApts.filter((a) => a.status === "Completed" || a.status === "Checked-in").length;
      const aptDates = patientApts.map((a) => new Date(a.start_time).getTime()).sort((a, b) => b - a);
      const lastVisitMs = aptDates.length > 0 ? aptDates[0] : 0;
      const daysSinceLastVisit = lastVisitMs > 0 ? (now - lastVisitMs) / (1000 * 60 * 60 * 24) : 999;

      let visitScore = 0;
      // Frequency component (up to 40 pts of 100 sub-score)
      if (totalApts >= 20) visitScore += 40;
      else if (totalApts >= 10) visitScore += 30;
      else if (totalApts >= 5) visitScore += 20;
      else if (totalApts >= 2) visitScore += 10;
      else if (totalApts >= 1) visitScore += 5;

      // Recency component (up to 40 pts)
      if (daysSinceLastVisit <= 30) visitScore += 40;
      else if (daysSinceLastVisit <= 60) visitScore += 30;
      else if (daysSinceLastVisit <= 90) visitScore += 20;
      else if (daysSinceLastVisit <= 180) visitScore += 10;

      // Consistency (up to 20 pts) - visits spread over time
      if (aptDates.length >= 2) {
        const spanDays = (aptDates[0] - aptDates[aptDates.length - 1]) / (1000 * 60 * 60 * 24);
        const avgInterval = spanDays / (aptDates.length - 1);
        if (avgInterval <= 30) visitScore += 20;
        else if (avgInterval <= 60) visitScore += 15;
        else if (avgInterval <= 90) visitScore += 10;
        else visitScore += 5;
      }
      visitScore = Math.min(visitScore, 100);

      // --- Revenue Value (25%) ---
      const totalBilled = patientInvs.reduce((s, i) => s + Number(i.total_amount || 0), 0);
      const avgInvoice = patientInvs.length > 0 ? totalBilled / patientInvs.length : 0;

      let revenueScore = 0;
      // Total billed (up to 50 pts)
      if (totalBilled >= 100000) revenueScore += 50;
      else if (totalBilled >= 50000) revenueScore += 40;
      else if (totalBilled >= 20000) revenueScore += 30;
      else if (totalBilled >= 5000) revenueScore += 20;
      else if (totalBilled > 0) revenueScore += 10;

      // Avg invoice (up to 50 pts)
      if (avgInvoice >= 10000) revenueScore += 50;
      else if (avgInvoice >= 5000) revenueScore += 40;
      else if (avgInvoice >= 2000) revenueScore += 30;
      else if (avgInvoice >= 500) revenueScore += 20;
      else if (avgInvoice > 0) revenueScore += 10;
      revenueScore = Math.min(revenueScore, 100);

      // --- Treatment Depth (20%) ---
      const distinctServices = new Set(patientProcs.map((p) => p.service_name)).size;
      const completedProcs = patientProcs.filter((p) => p.status === "Completed").length;

      let depthScore = 0;
      if (distinctServices >= 5) depthScore += 50;
      else if (distinctServices >= 3) depthScore += 35;
      else if (distinctServices >= 2) depthScore += 20;
      else if (distinctServices >= 1) depthScore += 10;

      if (completedProcs >= 10) depthScore += 50;
      else if (completedProcs >= 5) depthScore += 35;
      else if (completedProcs >= 2) depthScore += 20;
      else if (completedProcs >= 1) depthScore += 10;
      depthScore = Math.min(depthScore, 100);

      // --- Retention Signal (15%) ---
      let retentionScore = 0;
      if (patientRecord && aptDates.length >= 2) {
        const firstVisit = aptDates[aptDates.length - 1];
        const lastVisit = aptDates[0];
        const loyaltyMonths = (lastVisit - firstVisit) / (1000 * 60 * 60 * 24 * 30);
        if (loyaltyMonths >= 24) retentionScore = 100;
        else if (loyaltyMonths >= 12) retentionScore = 80;
        else if (loyaltyMonths >= 6) retentionScore = 60;
        else if (loyaltyMonths >= 3) retentionScore = 40;
        else retentionScore = 20;
      } else if (aptDates.length === 1) {
        retentionScore = 10;
      }

      // --- Compliance (10%) ---
      let complianceScore = 0;
      if (totalApts > 0) {
        const noShows = patientApts.filter((a) => a.status === "No-show" || a.status === "Cancelled").length;
        const showRate = (totalApts - noShows) / totalApts;
        complianceScore = Math.round(showRate * 100);
      }

      // --- Final weighted score ---
      const engagementScore = Math.round(
        visitScore * 0.30 +
        revenueScore * 0.25 +
        depthScore * 0.20 +
        retentionScore * 0.15 +
        complianceScore * 0.10
      );

      let tier: string, tierEmoji: string;
      if (engagementScore >= 80) { tier = "Platinum"; tierEmoji = "🏆"; }
      else if (engagementScore >= 60) { tier = "Gold"; tierEmoji = "🥇"; }
      else if (engagementScore >= 40) { tier = "Silver"; tierEmoji = "🥈"; }
      else { tier = "Early"; tierEmoji = "🌱"; }

      results[pid] = {
        score: engagementScore,
        tier,
        tierEmoji,
        breakdown: {
          visitFrequency: Math.round(visitScore * 0.30),
          revenueValue: Math.round(revenueScore * 0.25),
          treatmentDepth: Math.round(depthScore * 0.20),
          retentionSignal: Math.round(retentionScore * 0.15),
          compliance: Math.round(complianceScore * 0.10),
        },
        stats: {
          totalAppointments: totalApts,
          completedAppointments: completedApts,
          totalProcedures: patientProcs.length,
          distinctServices,
          totalBilled,
          daysSinceLastVisit: Math.round(daysSinceLastVisit),
          lastVisitDate: (() => {
            const completedDates = patientApts
              .filter((a) => a.status === "Completed")
              .map((a) => a.start_time)
              .sort((a, b) => new Date(b).getTime() - new Date(a).getTime());
            return completedDates.length > 0 ? completedDates[0] : null;
          })(),
        },
      };
    }

    // Persist the highlight scores on the patient record so they can be used
    // in list views, filters and reports.
    try {
      const stamp = new Date().toISOString();
      await Promise.all(
        Object.entries(results).map(([pid, r]: [string, any]) =>
          supabase
            .from("patients")
            .update({
              engagement_score: r.score,
              engagement_tier: r.tier,
              engagement_visit_frequency: r.breakdown.visitFrequency,
              engagement_revenue_value: r.breakdown.revenueValue,
              engagement_treatment_depth: r.breakdown.treatmentDepth,
              engagement_retention_signal: r.breakdown.retentionSignal,
              engagement_compliance: r.breakdown.compliance,
              engagement_updated_at: stamp,
              total_visits: r.stats.completedAppointments,
              lifetime_value: r.stats.totalBilled,
              last_visit_date: r.stats.lastVisitDate,
              days_since_last_visit:
                r.stats.daysSinceLastVisit >= 999 ? null : r.stats.daysSinceLastVisit,
            })
            .eq("id", pid)
        )
      );
    } catch (_e) {
      // Persisting is best-effort; scores are still returned to the caller.
    }

    return new Response(JSON.stringify({ scores: results }), {

      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
