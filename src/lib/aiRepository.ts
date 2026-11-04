import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import bundledLogo from "@/assets/skin-clinic-logo.png";

export type AiRepoKind = "case_analysis" | "skin_analysis";

export interface AiRepoRecord {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  kind: AiRepoKind;
  title: string;
  content: any;
  created_at: string;
}

export const AI_REPO_LABEL: Record<AiRepoKind, string> = {
  case_analysis: "Case Analysis",
  skin_analysis: "Photo AI Analysis",
};

/** Save a freshly generated AI result. Failures are logged, never block the result on screen. */
export async function saveAiRecord(args: {
  patientId: string;
  appointmentId?: string | null;
  kind: AiRepoKind;
  title: string;
  content: unknown;
}) {
  const { error } = await supabase.from("ai_repository").insert({
    patient_id: args.patientId,
    appointment_id: args.appointmentId ?? null,
    kind: args.kind,
    title: args.title,
    content: args.content as any,
  });
  if (error) console.warn("AI repository save failed", error);
  return !error;
}

/** Same ASCII rule as the invoice/report PDFs: Helvetica has no rupee sign etc. */
function clean(v: unknown): string {
  return String(v ?? "")
    .replace(/₹/g, "Rs ")
    .replace(/[–—]/g, "-")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[•·]/g, "-")
    .replace(/→/g, "->")
    .replace(/[^\x20-\x7E\n]/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const r = await fetch(url);
    if (!r.ok) return null;
    return new Uint8Array(await r.arrayBuffer());
  } catch {
    return null;
  }
}

export async function downloadAiRecordPdf(rec: AiRepoRecord, patientName: string) {
  const { jsPDF } = await import("jspdf");
  const { data: clinic } = await supabase.from("clinic_settings").select("*").limit(1).maybeSingle();
  const c: any = clinic || {};
  const logo = (c.logo_url ? await fetchBytes(c.logo_url) : null) ?? (await fetchBytes(bundledLogo));

  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 40;
  const maxW = W - M * 2;
  let y = 40;

  // Logo, as on the invoice: 60pt tall at the top-left.
  if (logo) {
    try {
      const p = doc.getImageProperties(logo);
      const h = 60, w = (p.width / p.height) * h;
      doc.addImage(logo, p.fileType, M, y, w, h);
      y += h + 22;
    } catch { y += 30; }
  } else y += 30;

  // Header info - two columns, label: value, like the invoice.
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(13);
  const when = format(new Date(rec.created_at), "dd/MM/yyyy h:mm a");
  const left = [["Patient Name", patientName], ["Report", AI_REPO_LABEL[rec.kind]]];
  const right = [["Generated On", when], ["Clinic", c.name || "The Skin Clinic"]];
  left.forEach(([l, v], i) => doc.text(clean(`${l}: ${v}`), M, y + i * 14));
  right.forEach(([l, v], i) => doc.text(clean(`${l}: ${v}`), 320, y + i * 14));
  y += 34;
  doc.setDrawColor(0);
  doc.setLineWidth(0.8);
  doc.line(M, y, W - M, y);
  y += 22;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text(clean(rec.title || AI_REPO_LABEL[rec.kind]), M, y);
  y += 18;

  const ensure = (need: number) => {
    if (y + need > H - 50) { doc.addPage(); y = 50; }
  };
  const heading = (t: string) => {
    ensure(34);
    y += 6;
    doc.setFillColor(242, 242, 242);
    doc.setDrawColor(0);
    doc.setLineWidth(0.5);
    doc.rect(M, y, maxW, 18, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text(clean(t), M + 6, y + 12.5);
    y += 26;
  };
  const para = (t: string, indent = 0) => {
    if (!t) return;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    const lines = doc.splitTextToSize(clean(t), maxW - indent - 6);
    for (const ln of lines) { ensure(13); doc.text(ln, M + 6 + indent, y); y += 13; }
    y += 3;
  };
  const bullets = (arr?: string[]) => (arr || []).forEach((b) => para(`-  ${b}`, 4));

  const a = rec.content || {};
  if (rec.kind === "case_analysis") {
    heading("Case Summary"); para(a.summary);
    if (a.timeline?.length) {
      heading("Clinical Timeline");
      a.timeline.forEach((t: any) => para(`${t.date} - ${t.event}${t.details ? `: ${t.details}` : ""}`));
    }
    if (a.diagnosisHistory?.length) { heading("Diagnosis History"); bullets(a.diagnosisHistory); }
    if (a.treatmentPatterns) { heading("Treatment Patterns"); para(a.treatmentPatterns); }
    if (a.medicationSummary) { heading("Medication Summary"); para(a.medicationSummary); }
    if (a.skinProgress) { heading("Skin Progress Assessment"); para(a.skinProgress); }
    if (a.keyFindings?.length) { heading("Key Findings"); bullets(a.keyFindings); }
    if (a.clinicalRecommendations?.length) { heading("Clinical Recommendations"); bullets(a.clinicalRecommendations); }
  } else {
    heading("Summary");
    para(`Overall improvement: ${a.overallImprovement ?? "-"}%`);
    para(a.summary);
    if (a.metrics?.length) {
      heading("Skin Metrics");
      const cols = [maxW * 0.46, maxW * 0.18, maxW * 0.18, maxW * 0.18];
      const row = (cells: string[], bold = false) => {
        ensure(20);
        let x = M;
        doc.setFont("helvetica", bold ? "bold" : "normal");
        doc.setFontSize(9);
        cells.forEach((cell, i) => {
          doc.rect(x, y - 12, cols[i], 18);
          doc.text(clean(cell), x + 5, y);
          x += cols[i];
        });
        y += 18;
      };
      row(["Metric", "Before", "After", "Change"], true);
      a.metrics.forEach((m: any) => row([m.name, `${m.before}/10`, `${m.after}/10`, m.change]));
      y += 6;
    }
    if (a.details) { heading("Detailed Observations"); para(a.details); }
    if (a.recommendations?.length) { heading("Recommendations"); bullets(a.recommendations); }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(115);
    doc.text("AI-generated content. To be reviewed by the treating doctor.", M, H - 22);
    doc.text(`Page ${i} of ${pages}`, W - M, H - 22, { align: "right" });
  }

  const safe = patientName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  doc.save(`AI-${rec.kind === "case_analysis" ? "Case" : "Photo"}-${safe}-${format(new Date(rec.created_at), "yyyyMMdd-HHmm")}.pdf`);
}
