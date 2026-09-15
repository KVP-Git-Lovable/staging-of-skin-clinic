import { supabase } from "@/integrations/supabase/client";
import type { QueryClient } from "@tanstack/react-query";

/**
 * Merge AI-recommended product/service items with the template's product/service config
 * so that downstream code (Rx + Procedures) has dosage/frequency/duration/instructions.
 * Matching is done by product_id/service_id when present, otherwise by case-insensitive name.
 */
export function enrichAiProducts(aiProducts: any[], tplProducts: any[]) {
  return (aiProducts || []).map((p: any) => {
    const name = p.product_name || p.name || "";
    const match = (tplProducts || []).find((tp: any) => {
      if (p.product_id && tp.product_id && p.product_id === tp.product_id) return true;
      const tpName = tp.pharma_products?.name || "";
      return tpName && name && tpName.toLowerCase() === name.toLowerCase();
    });
    return {
      product_id: p.product_id || match?.product_id || null,
      product_name: name || match?.pharma_products?.name || "Product",
      advice: p.advice || match?.advice_text || "",
      dosage: p.dosage || match?.dosage || null,
      frequency: p.frequency || match?.frequency || null,
      duration: p.duration || match?.duration || null,
      instructions: p.instructions || match?.instructions || null,
    };
  });
}

export function enrichAiServices(aiServices: any[], tplServices: any[]) {
  return (aiServices || []).map((s: any) => {
    const name = s.service_name || s.name || "";
    const match = (tplServices || []).find((ts: any) => {
      if (s.service_id && ts.service_id && s.service_id === ts.service_id) return true;
      const tsName = ts.services?.name || "";
      return tsName && name && tsName.toLowerCase() === name.toLowerCase();
    });
    return {
      service_id: s.service_id || match?.service_id || null,
      service_name: name || match?.services?.name || "Service",
      advice: s.advice || match?.advice_text || "",
    };
  });
}

interface ApproveOptions {
  selectedProducts?: any[]; // explicit list to approve; defaults to ai_products
  selectedServices?: any[];
  reviewedBy?: string | null;
  drNotes?: string | null;
  queryClient?: QueryClient;
  /** Status to set on the survey_responses row. Defaults to "approved". */
  newStatus?: string;
}

/**
 * Approve a survey response and auto-create:
 *  - prescriptions in the patient's Rx tab (one per selected product)
 *  - procedures in the patient's Procedures tab with status "Recommended" (one per selected service)
 * Returns counts so the caller can toast.
 */
export async function approveSurveyResponse(
  response: any,
  opts: ApproveOptions = {}
): Promise<{ rxCount: number; procCount: number }> {
  const aiProducts = (response.ai_products || []) as any[];
  const aiServices = (response.ai_services || []) as any[];
  const products = (opts.selectedProducts && opts.selectedProducts.length > 0)
    ? opts.selectedProducts
    : aiProducts;
  const services = (opts.selectedServices && opts.selectedServices.length > 0)
    ? opts.selectedServices
    : aiServices;

  const templateName: string =
    response.survey_templates?.name ||
    response.template?.name ||
    "Survey";
  const sourcePrefix = `From Survey: ${templateName}`;

  // 1. Update survey_responses
  const { error: upErr } = await supabase.from("survey_responses").update({
    dr_status: opts.newStatus || "approved",
    selected_products: products,
    selected_services: services,
    reviewed_by: opts.reviewedBy || null,
    reviewed_at: new Date().toISOString(),
    ...(opts.drNotes !== undefined ? { dr_notes: opts.drNotes } : {}),
  }).eq("id", response.id);
  if (upErr) throw upErr;

  // 2. Insert prescriptions
  let rxCount = 0;
  if (products.length > 0) {
    const rxEntries = products.map((p: any) => {
      const baseInstr = p.instructions || p.advice || "";
      const instructions = baseInstr
        ? `${sourcePrefix} — ${baseInstr}`
        : sourcePrefix;
      return {
        procedure_id: null,
        survey_response_id: response.id,
        medicine_name: p.product_name || p.name || "Unknown",
        dosage: p.dosage || null,
        frequency: p.frequency || null,
        duration: p.duration || null,
        quantity: p.quantity || 1,
        instructions,
        product_id: p.product_id || null,
      };
    });
    const { error: rxErr } = await supabase.from("prescriptions").insert(rxEntries);
    if (rxErr) throw new Error("Approved but failed to create Rx: " + rxErr.message);
    rxCount = rxEntries.length;
  }

  // 3. Insert procedures (status: Recommended)
  let procCount = 0;
  const patientId = response.patient_id || response.patients?.id;
  if (services.length > 0 && patientId) {
    const procEntries = services.map((s: any) => {
      const advice = s.advice || "";
      const notes = advice
        ? `${sourcePrefix} — ${advice}`
        : sourcePrefix;
      return {
        patient_id: patientId,
        appointment_id: response.appointment_id || null,
        service_name: s.service_name || s.name || "Service",
        status: "Recommended",
        procedure_date: new Date().toISOString(),
        procedure_notes: notes,
        recommendations: advice || null,
        survey_response_id: response.id,
      };
    });
    const { error: procErr } = await supabase.from("procedures").insert(procEntries);
    if (procErr) throw new Error("Approved but failed to create procedures: " + procErr.message);
    procCount = procEntries.length;
  }

  // 4. Invalidate caches
  const qc = opts.queryClient;
  if (qc && patientId) {
    qc.invalidateQueries({ queryKey: ["patient-prescriptions", patientId] });
    qc.invalidateQueries({ queryKey: ["patient-procedures", patientId] });
    qc.invalidateQueries({ queryKey: ["patient-surveys", patientId] });
  }
  if (qc) {
    qc.invalidateQueries({ queryKey: ["all-survey-responses"] });
    qc.invalidateQueries({ queryKey: ["survey-responses"] });
    qc.invalidateQueries({ queryKey: ["survey-response-detail", response.id] });
  }

  return { rxCount, procCount };
}