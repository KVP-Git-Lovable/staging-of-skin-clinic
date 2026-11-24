import { reserveTab, type PendingTab } from "./newTab";
import { supabase } from "@/integrations/supabase/client";
import { KNOWLEDGE_BUCKET, splitResources, type KnowledgeArticle, type KnowledgeResource } from "@/lib/knowledge";
import {
  factCards, patientFacts, patientSummaryIsPublic, PATIENT_SUMMARY_DISCLAIMER,
} from "@/lib/patientSummary";
import { CLINIC_ADDRESS_LINES, CLINIC_PHONES } from "@/lib/clinicContact";

/**
 * The patient summary, on paper.
 *
 * The clinic explains a treatment, the patient nods, and by the time they are
 * home half of it is gone - particularly the aftercare, which is the part that
 * changes the result. A handout is the oldest fix there is and it needs no
 * login, which matters here: the patient portal has had fifteen sign-ins in its
 * life against twenty-seven thousand patients.
 *
 * Built as a self-contained HTML document and handed to the browser's own print
 * dialogue, the same way printAppointments.ts does the day sheet. No PDF
 * service, no new dependency, and the clinic can "print" to PDF from the same
 * dialogue if they want to send the file instead.
 *
 * ── Black and white is the design constraint ──
 *
 * A clinic printer is usually monochrome, so colour can decorate but must never
 * be the only thing carrying a meaning. Do and Don't are a tick and a cross and
 * the words themselves, not a green box and a red box; the cards have borders
 * rather than fills. print-color-adjust is set where a fill genuinely helps on
 * a colour printer, and the page is still right without it.
 */

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));

/** Paragraphs from plain text, blank-line separated, each one escaped. */
function paragraphs(text: string): string {
  return String(text ?? "")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

export const UNPUBLISHED_HANDOUT_ERROR =
  "This article is not published yet, so it cannot be printed for a patient.";

/**
 * How many pictures a handout carries, and how big one may be.
 *
 * Two, because this is a page a patient reads standing at a reception desk, not
 * a brochure. The byte cap is a guard against a document the browser cannot
 * print: a picture is embedded in the page itself (see below), so one enormous
 * attachment would otherwise sink the whole handout.
 */
/**
 * Said under the pictures, on the page the patient takes home.
 *
 * These are teaching diagrams - several were drawn by AI, and the article's own
 * resource note says as much to the clinician. Somebody holding the paper
 * deserves the same fact in ordinary words, so nobody reads a cross-section as
 * a photograph of their own skin or as a promise of their own result.
 */
export const ILLUSTRATION_CAPTION =
  "Drawing used to explain the treatment — not a photograph of a patient, and not a picture of your own result.";

export const HANDOUT_IMAGE_LIMIT = 2;
export const HANDOUT_IMAGE_MAX_BYTES = 4 * 1024 * 1024;

/** The pictures worth printing, in the order the article lists them. */
export function printableImages(resources: unknown, limit = HANDOUT_IMAGE_LIMIT): KnowledgeResource[] {
  return splitResources(resources).pictures.slice(0, Math.max(0, limit));
}

/**
 * Turn those pictures into something an <img> can show.
 *
 * `resolve` is injected rather than reached for, so the decision-making here is
 * testable without Supabase or a network - and so the one place that touches
 * storage (signedImageSource, below) stays as thin as it can be.
 *
 * A picture that will not resolve is DROPPED, not thrown. A signed URL can
 * expire, a file can be missing, a network can fail; none of that is a reason
 * for a patient to leave with no handout at all. They lose a diagram instead.
 */
export async function handoutImages(
  resources: unknown,
  resolve: (resource: KnowledgeResource) => Promise<string | null>,
  limit = HANDOUT_IMAGE_LIMIT,
): Promise<string[]> {
  const chosen = printableImages(resources, limit);
  const settled = await Promise.all(
    chosen.map(async (resource) => {
      try { return await resolve(resource); } catch { return null; }
    }),
  );
  return settled.filter((src): src is string => !!src);
}

/**
 * A stored attachment as bytes embedded in the page.
 *
 * Deliberately NOT the signed URL the screen uses. The document is written into
 * a tab that prints a moment later, and a picture still travelling over the
 * network when the print dialogue opens prints as a blank box. Embedded bytes
 * also survive "Save as PDF" and being reprinted next week, where a signed URL
 * is dead in an hour.
 *
 * An image resource can also be a plain https link rather than a stored file;
 * that one is handed to the <img> as-is, since there is nothing to sign and
 * fetching it would only add a cross-origin failure to the list.
 */
export async function signedImageSource(resource: KnowledgeResource): Promise<string | null> {
  if (!resource.path) return resource.url ?? null;
  const { data, error } = await supabase.storage
    .from(KNOWLEDGE_BUCKET)
    .createSignedUrl(resource.path, 3600);
  if (error || !data?.signedUrl) return null;
  const response = await fetch(data.signedUrl);
  if (!response.ok) return null;
  const blob = await response.blob();
  if (blob.size > HANDOUT_IMAGE_MAX_BYTES) return null;
  return await new Promise<string | null>((done) => {
    const reader = new FileReader();
    reader.onload = () => done(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => done(null);
    reader.readAsDataURL(blob);
  });
}

/**
 * The document itself, as a string.
 *
 * Separate from the printing so it can be read in a test without a browser:
 * the escaping and the published-only rule are the two things here worth
 * proving, and neither needs a window.
 */
export function patientHandoutHtml(
  article: Pick<KnowledgeArticle, "title" | "status" | "is_active" | "patient_summary" | "patient_facts">,
  opts: { serviceName?: string; clinicName?: string; images?: string[] } = {},
): string {
  // The same gate as the screen, repeated here rather than trusted from the
  // caller: this function's output is the thing that ends up in a patient's
  // hand, so it decides for itself.
  if (!patientSummaryIsPublic(article)) throw new Error(UNPUBLISHED_HANDOUT_ERROR);

  const facts = patientFacts(article.patient_facts);
  const cards = factCards(facts);
  const clinic = opts.clinicName || "The Skin Clinic";
  const heading = opts.serviceName || article.title;
  const images = opts.images ?? [];

  const list = (items: string[] | undefined, mark: string, title: string) =>
    items?.length
      ? `<section class="list"><h2><span class="mark">${mark}</span>${esc(title)}</h2><ul>${items
          .map((i) => `<li>${esc(i)}</li>`)
          .join("")}</ul></section>`
      : "";

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(heading)}</title>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1a1a1a; margin: 0; line-height: 1.5; font-size: 12pt; }
  header { border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 16px; }
  .clinic { font-size: 10pt; letter-spacing: .06em; text-transform: uppercase; }
  h1 { font-size: 19pt; margin: 6px 0 2px; }
  .kicker { font-size: 10pt; color: #555; }
  p { margin: 0 0 9px; }
  /* Cards: a border, not a fill, so a monochrome printer still shows the box. */
  .cards { display: flex; flex-wrap: wrap; gap: 8px; margin: 14px 0; }
  .card { border: 1px solid #999; border-radius: 6px; padding: 7px 10px; min-width: 110px; flex: 1 1 110px; }
  .card .label { font-size: 8.5pt; text-transform: uppercase; letter-spacing: .05em; color: #555; }
  .card .value { font-size: 11.5pt; font-weight: 600; margin-top: 2px; }
  /* A diagram is capped so one picture cannot take the whole sheet, and kept
     whole rather than split across a page break. */
  .pictures { margin: 14px 0; break-inside: avoid; text-align: center; }
  .pictures img { max-width: 100%; max-height: 78mm; object-fit: contain; }
  .caption { margin-top: 4px; font-size: 9pt; color: #555; font-style: italic; }
  .list { margin: 12px 0; break-inside: avoid; }
  /* Both headings together: the timeline's used to fall through to the
     browser's default h2 and printed half again as large as the others. */
  .list h2, .timeline h2 { font-size: 12pt; margin: 0 0 5px; display: flex; align-items: baseline; gap: 6px; }
  /* The tick and the cross carry Do vs Don't without any colour at all. */
  .mark { font-weight: 700; }
  ul { margin: 0; padding-left: 20px; }
  li { margin-bottom: 3px; }
  .timeline { margin: 12px 0; break-inside: avoid; }
  .step { display: flex; gap: 10px; padding: 5px 0; border-top: 1px solid #ddd; }
  .step .when { min-width: 110px; font-weight: 600; }
  footer { margin-top: 20px; padding-top: 8px; border-top: 1px solid #ddd; font-size: 9pt; color: #555; }
  .note { font-style: italic; margin-bottom: 5px; }
</style></head><body>
<header>
  <div class="clinic">${esc(clinic)}</div>
  <h1>${esc(heading)}</h1>
  <div class="kicker">What this treatment involves</div>
</header>
${paragraphs(article.patient_summary)}
${cards.length ? `<div class="cards">${cards
    .map((c) => `<div class="card"><div class="label">${esc(c.label)}</div><div class="value">${esc(c.value)}</div></div>`)
    .join("")}</div>` : ""}
${images.length ? `<section class="pictures">${images
    .map((src) => `<img src="${esc(src)}" alt="Illustration of the treatment">`)
    .join("")}<p class="caption">${esc(ILLUSTRATION_CAPTION)}</p></section>` : ""}
${list(facts.dos, "✓", "Please do")}
${list(facts.donts, "✗", "Please don't")}
${facts.timeline?.length ? `<section class="timeline"><h2>What happens, and when</h2>${facts.timeline
    .map((s) => `<div class="step"><div class="when">${esc(s.when)}</div><div>${esc(s.what)}</div></div>`)
    .join("")}</section>` : ""}
<footer>
  <p class="note">${esc(PATIENT_SUMMARY_DISCLAIMER)}</p>
  <p>${esc(clinic)} · ${CLINIC_ADDRESS_LINES.map(esc).join(", ")} · ${CLINIC_PHONES.map((p) => esc(p.label)).join(" · ")}</p>
</footer>
</body></html>`;
}

/**
 * Print it.
 *
 * `tab` must be reserved in the click handler itself - a browser only honours
 * window.open while it is handling the gesture, so a tab opened after any await
 * is blocked as a pop-up. See src/lib/newTab.ts.
 */
export async function printPatientHandout(
  article: Parameters<typeof patientHandoutHtml>[0] & { resources?: unknown },
  opts: Parameters<typeof patientHandoutHtml>[1] = {},
  tab: PendingTab = reserveTab(),
): Promise<void> {
  if (tab.blocked) throw new Error("Please allow pop-ups to print this handout.");
  // Refuse before fetching anything: an unpublished article must not even have
  // its attachments pulled down for a patient's page.
  if (!patientSummaryIsPublic(article)) { tab.fail(UNPUBLISHED_HANDOUT_ERROR); throw new Error(UNPUBLISHED_HANDOUT_ERROR); }
  try {
    const images = opts.images ?? await handoutImages(article.resources, signedImageSource);
    tab.write(patientHandoutHtml(article, { ...opts, images }));
    // Longer when pictures are embedded: the bytes are local, but the browser
    // still has to decode and lay them out, and printing before that prints a
    // blank frame where the diagram should be.
    tab.print(images.length ? 900 : 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : "The handout could not be prepared.";
    // Not left on the pulsing placeholder, which reads as "still working" for
    // ever - see reserveTab in src/lib/newTab.ts.
    tab.fail(message);
    throw e;
  }
}
