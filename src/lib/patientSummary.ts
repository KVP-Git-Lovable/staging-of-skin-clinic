import { z } from "zod";
import type { KnowledgeArticle } from "@/lib/knowledge";

/**
 * The patient's version of a knowledge article.
 *
 * The clinical articles are written for dermatologists and read like it -
 * "barrier-first preparation", "tyrosinase-inhibitor priming", Fitzpatrick
 * phototypes, 12,500 characters on average. A patient asked to read one learns
 * nothing. patient_summary is the same knowledge in plain words.
 *
 * ── Why the facts are structured rather than prose ──
 *
 * The clinic asked for something a patient would actually look at, not another
 * wall of text. The app draws the short answers as cards - how many sessions,
 * how long each takes, what the downtime is - and a paragraph cannot be drawn
 * as a card. So they are stored as named fields and the layout belongs to the
 * app, which also means the handout and the screen stay in step without anyone
 * formatting anything twice.
 *
 * ── Why every parser here is forgiving ──
 *
 * patient_facts is jsonb written by an AI proposal and a human editor, and read
 * by a screen a patient is looking at. The database guard rejects a malformed
 * shape on the way IN (see drizzle/migrations/0032), so anything odd reaching
 * this code is historical or hand-written. It must degrade to "that card is not
 * filled in" rather than throw: a blank card is a gap, an exception mid-consult
 * is the doctor's screen going white in front of the patient.
 *
 * Same tolerant shape as articleResources in src/lib/knowledge.ts.
 */

/** Short answers, each one line. Empty string means "not filled in". */
export const FACT_CARDS = [
  ["sessions", "Sessions"],
  ["each_visit", "Each visit"],
  ["downtime", "Downtime"],
  ["comfort", "How it feels"],
  ["results_when", "Results show"],
] as const;
export type FactCardKey = typeof FACT_CARDS[number][0];

const shortLine = z.string().trim().min(1).max(120);
const point = z.string().trim().min(1).max(200);

export const timelineStepSchema = z.object({
  when: z.string().trim().min(1).max(60),
  what: z.string().trim().min(1).max(300),
});
export type TimelineStep = z.infer<typeof timelineStepSchema>;

export const patientFactsSchema = z.object({
  sessions: shortLine.optional(),
  each_visit: shortLine.optional(),
  downtime: shortLine.optional(),
  comfort: shortLine.optional(),
  results_when: shortLine.optional(),
  dos: z.array(point).max(8).optional(),
  donts: z.array(point).max(8).optional(),
  timeline: z.array(timelineStepSchema).max(6).optional(),
});
export type PatientFacts = z.infer<typeof patientFactsSchema>;

export const EMPTY_FACTS: PatientFacts = {};

/**
 * patient_facts as something safe to render.
 *
 * Field by field rather than all-or-nothing: one bad entry must not throw away
 * four good cards a doctor has already approved. A whole-object parse would do
 * exactly that, which is the difference between this and a plain safeParse.
 */
export function patientFacts(value: unknown): PatientFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_FACTS;
  const raw = value as Record<string, unknown>;
  const out: PatientFacts = {};
  for (const [key] of FACT_CARDS) {
    const parsed = shortLine.safeParse(raw[key]);
    if (parsed.success) out[key] = parsed.data;
  }
  for (const key of ["dos", "donts"] as const) {
    if (!Array.isArray(raw[key])) continue;
    // Each point on its own, so one blank bullet does not drop the list.
    const points = (raw[key] as unknown[]).flatMap((p) => {
      const parsed = point.safeParse(p);
      return parsed.success ? [parsed.data] : [];
    });
    if (points.length) out[key] = points.slice(0, 8);
  }
  if (Array.isArray(raw.timeline)) {
    const steps = (raw.timeline as unknown[]).flatMap((s) => {
      const parsed = timelineStepSchema.safeParse(s);
      return parsed.success ? [parsed.data] : [];
    });
    if (steps.length) out.timeline = steps.slice(0, 6);
  }
  return out;
}

/**
 * patient_facts as the editor is holding it, exactly as typed.
 *
 * patientFacts is the shape a patient sees and the one that is saved - trimmed,
 * blanks dropped. The editor must NOT redraw its boxes from that: a new "Add"
 * row starts blank and would vanish on the next render, and a space typed at
 * the end of "3 " would be trimmed away before the next word could follow it.
 * So the editor keeps the raw strings, blanks included, and the save step runs
 * patientFacts over them (see ArticleEditor) so nothing blank or padded is
 * ever stored. Still forgiving: anything that is not a string is ignored.
 */
export function editableFacts(value: unknown): PatientFacts {
  if (!value || typeof value !== "object" || Array.isArray(value)) return EMPTY_FACTS;
  const raw = value as Record<string, unknown>;
  const out: PatientFacts = {};
  for (const [key] of FACT_CARDS) {
    if (typeof raw[key] === "string") out[key] = raw[key] as string;
  }
  for (const key of ["dos", "donts"] as const) {
    if (!Array.isArray(raw[key])) continue;
    out[key] = (raw[key] as unknown[]).filter((p): p is string => typeof p === "string").slice(0, 8);
  }
  if (Array.isArray(raw.timeline)) {
    out.timeline = (raw.timeline as unknown[]).flatMap((s) => {
      if (!s || typeof s !== "object") return [];
      const { when, what } = s as Record<string, unknown>;
      return [{ when: typeof when === "string" ? when : "", what: typeof what === "string" ? what : "" }];
    }).slice(0, 6);
  }
  return out;
}

/**
 * The cards that are actually filled in, in a fixed order.
 *
 * A half-written summary renders as three cards rather than five with blanks
 * in them - an empty box beside a filled one reads as missing information to
 * the patient looking at it.
 */
export function factCards(facts: PatientFacts): { key: FactCardKey; label: string; value: string }[] {
  return FACT_CARDS.flatMap(([key, label]) => {
    const value = facts[key];
    return value ? [{ key, label, value }] : [];
  });
}

/** Is there anything to show a patient at all? */
export function hasPatientSummary(
  article: Pick<KnowledgeArticle, "patient_summary" | "patient_facts">,
): boolean {
  if (String(article.patient_summary ?? "").trim()) return true;
  const facts = patientFacts(article.patient_facts);
  return factCards(facts).length > 0 || !!facts.dos?.length || !!facts.donts?.length || !!facts.timeline?.length;
}

/**
 * May this be shown to a patient?
 *
 * The one rule the whole feature rests on. A patient summary is clinical
 * content: it reaches a patient's eyes only from an article a doctor has
 * published and left active, exactly like the clinical text it was written
 * from. A draft is for the clinician who is writing it and nobody else.
 */
export function patientSummaryIsPublic(
  article: Pick<KnowledgeArticle, "status" | "is_active" | "patient_summary" | "patient_facts">,
): boolean {
  return article.status === "published" && article.is_active === true && hasPatientSummary(article);
}

/**
 * The two buttons, named here so they can never be given the same name again.
 *
 * They were both called "Write patient summary": one on the article page, one
 * inside the editor it opens. Pressing the first showed the second, which reads
 * as a button that does nothing but show itself. The first one now starts the
 * writing, and the second says what it does that the first does not - replace
 * what is already on the screen.
 */
export const WRITE_SUMMARY_CTA = "Write patient summary";
export const AI_WRITE_LABEL = "Write with AI";
export const AI_REWRITE_LABEL = "Rewrite with AI";
export function aiWriteLabel(written: boolean): string {
  return written ? AI_REWRITE_LABEL : AI_WRITE_LABEL;
}

/**
 * Said on the screen and printed on the handout.
 *
 * An article is about a treatment, not about the person reading it: it was
 * written for a service and a demographic, with no patient in front of it. The
 * line is here, once, so the screen and the paper cannot drift apart.
 */
export const PATIENT_SUMMARY_DISCLAIMER =
  "This explains the treatment in general. It is not personal medical advice — your doctor will tell you what applies to you.";
