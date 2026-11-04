import type { Tables } from "@/integrations/supabase/types";
import { z } from "zod";

export const resourceSchema = z.object({
  id: z.string(), kind: z.enum(["file", "image", "link", "video", "article"]), title: z.string().trim().min(1).max(300),
  url: z.string().url().refine((s) => ["http:", "https:"].includes(new URL(s).protocol)).optional(),
  path: z.string().optional(), article_id: z.string().uuid().optional(), note: z.string().max(4000).optional(),
  source_url: z.string().url().refine((s) => ["http:", "https:"].includes(new URL(s).protocol)).optional(),
});
export type KnowledgeResource = z.infer<typeof resourceSchema>;
export function articleResources(value: unknown): KnowledgeResource[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => { const parsed = resourceSchema.safeParse(item); return parsed.success ? [parsed.data] : []; });
}

export type KnowledgeArticle = Tables<"knowledge_articles">;
export const clinicalFields = [
  ["clinical_protocol", "Clinical protocol"],
  ["contraindications", "Contraindications & safety"],
  ["pre_post_care", "Pre / post-procedure care"],
  ["complications_management", "Complication management"],
  ["sources", "References & evidence"],
] as const;
export type ClinicalField = typeof clinicalFields[number][0];

/**
 * Does this section open folded, behind a "Read more"?
 *
 * The clinic's articles run to 12,500 characters on average and one is
 * 25,000, so a page of five sections is a wall of clinical prose and nobody
 * finds the part they came for. Folding is purely how it is SHOWN - not one
 * clinical word is changed, because the text is doctor-approved under a
 * review trigger and rewriting it would need every article re-approved.
 *
 * A short section must not get a pointless toggle: a three-line
 * Contraindications is quicker to read than to expand. The threshold is in
 * characters because that is what we have before anything is rendered; it is
 * a proxy for height, not a measurement of it.
 */
export const SECTION_FOLD_CHARS = 600;
export function sectionStartsCollapsed(text: string | null | undefined): boolean {
  return String(text ?? "").trim().length > SECTION_FOLD_CHARS;
}

/**
 * Pictures apart from everything else.
 *
 * Every resource used to land in one "Attachments & further reading" list at
 * the very bottom, so a diagram that explains a step sat below the
 * references, past 12,000 characters of prose. Pictures belong with the
 * content; PDFs, links, videos and related articles genuinely are "further
 * reading" and stay where they are.
 */
export function splitResources(value: unknown): { pictures: KnowledgeResource[]; others: KnowledgeResource[] } {
  const all = articleResources(value);
  return {
    pictures: all.filter((r) => r.kind === "image"),
    others: all.filter((r) => r.kind !== "image"),
  };
}

/**
 * The src of a picture written into the article body, or null to drop it.
 *
 * Body images were thrown away wholesale (img: () => null), so a picture
 * placed next to the step it illustrates silently vanished. Rendering them
 * means accepting a src somebody typed, hence the guard: http(s) only, so a
 * javascript: or data: src cannot ride in through markdown. skipHtml stays on
 * separately, which is what keeps raw HTML out.
 *
 * Note what this CANNOT do: an uploaded picture lives in the private
 * knowledge-attachments bucket and needs a signed URL, which markdown has no
 * way to produce. Those keep going through ArticleResources. Only an external
 * https picture can sit inline in the text.
 */
export function safeImageSrc(src: string | null | undefined): string | null {
  const raw = String(src ?? "").trim();
  if (!raw) return null;
  try {
    const url = new URL(raw, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? raw : null;
  } catch {
    return null;
  }
}
export function ageInYears(dob: string | null | undefined, today = new Date()): number | null {
  if (!dob) return null;
  const [year, month, day] = dob.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day || birth > today) return null;
  return today.getFullYear() - year - (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
}
export function matchesDemographics(article: Pick<KnowledgeArticle, "gender" | "age_rule" | "min_age" | "max_age">, age: number | null, gender: string | null | undefined) {
  if (article.gender !== "both" && article.gender !== gender?.trim().toLowerCase()) return false;
  return article.age_rule === "all_ages" || (age !== null && article.min_age !== null && article.max_age !== null && age >= article.min_age && age <= article.max_age);
}
export function targetLabel(article: Pick<KnowledgeArticle, "gender" | "age_rule" | "min_age" | "max_age">) {
  return `${article.age_rule === "all_ages" ? "All ages" : `${article.min_age}–${article.max_age} years`} · ${article.gender === "both" ? "All genders" : article.gender}`;
}
export function appendCare(existing: string, care: string) {
  return [existing.trim(), care.trim()].filter(Boolean).join("\n\n");
}
export function suggestedArticleTitle(service: string, target: Pick<KnowledgeArticle, "gender" | "age_rule" | "min_age" | "max_age">) {
  if (!service) return "";
  return `${service.trim()} - ${targetLabel(target).replace(" · ", " - ")}`;
}
export function cloneArticle(article: KnowledgeArticle) {
  const { id, created_at, updated_at, created_by, updated_by, created_by_name, updated_by_name, revision, reviewed_at, reviewed_by, deleted_at, ...content } = article;
  return { ...content, status: "draft", is_active: false, resources: article.resources };
}
export function revisionChanges(previous: Record<string, unknown>, current: Record<string, unknown>) {
  const ignored = new Set(["updated_at", "updated_by", "updated_by_name", "revision", "reviewed_at", "reviewed_by"]);
  return Object.fromEntries(Object.entries(current).filter(([k, v]) => !ignored.has(k) && JSON.stringify(previous[k]) !== JSON.stringify(v)).map(([k, v]) => [k, { before: previous[k] ?? null, after: v }]));
}