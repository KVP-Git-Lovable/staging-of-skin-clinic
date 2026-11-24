import { CalendarDays, Clock, Hourglass, Smile, Sparkles, Check, X } from "lucide-react";
import type { KnowledgeArticle } from "@/lib/knowledge";
import { splitResources } from "@/lib/knowledge";
import {
  factCards, patientFacts, PATIENT_SUMMARY_DISCLAIMER, type FactCardKey,
} from "@/lib/patientSummary";
import { ArticleResources } from "./ArticleResources";

/**
 * The article as a patient sees it.
 *
 * Shown on the doctor's screen, turned towards the patient mid-consult, and
 * printed as a handout by src/lib/patientHandout.ts. Both are driven from the
 * same fields, so what the patient is shown and what they take home cannot
 * drift apart.
 *
 * Bigger type than the clinical view and plenty of air between the parts: this
 * is read at arm's length across a desk, often by somebody who has just had
 * drops in their eyes or is holding a phone at the edge of the screen. The
 * cards exist because the clinic's own words were that patients "get bored
 * looking at" a page of text - a number in a box is read, a number in the
 * fourth sentence of a paragraph is not.
 *
 * Colour never carries a meaning on its own. Do and Don't are a tick and a
 * cross and the words themselves, because the handout version of this prints
 * on a monochrome printer.
 */

const CARD_ICONS: Record<FactCardKey, typeof Clock> = {
  sessions: CalendarDays,
  each_visit: Clock,
  downtime: Hourglass,
  comfort: Smile,
  results_when: Sparkles,
};

type Shape = Pick<KnowledgeArticle, "patient_summary" | "patient_facts" | "resources">;

export function PatientSummary({ article }: { article: Shape }) {
  const facts = patientFacts(article.patient_facts);
  const cards = factCards(facts);
  // The article's own illustrations: already clinician-approved, already
  // attached, and a diagram is the most patient-friendly thing on the page.
  const { pictures } = splitResources(article.resources);
  const text = String(article.patient_summary ?? "").trim();

  return (
    <div className="space-y-6">
      {text && (
        <div className="space-y-3 text-base leading-relaxed">
          {text.split(/\n{2,}/).map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">{p.trim()}</p>
          ))}
        </div>
      )}

      {cards.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {cards.map(({ key, label, value }) => {
            const Icon = CARD_ICONS[key];
            return (
              <div key={key} className="rounded-lg border bg-card/60 p-3 transition-transform hover:-translate-y-0.5 motion-reduce:transform-none motion-reduce:transition-none">
                <Icon className="h-4 w-4 text-primary" aria-hidden />
                <p className="mt-2 text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="text-sm font-semibold leading-snug">{value}</p>
              </div>
            );
          })}
        </div>
      )}

      {pictures.length > 0 && <ArticleResources value={pictures} heading={null} />}

      {(facts.dos?.length || facts.donts?.length) && (
        <div className="grid gap-4 sm:grid-cols-2">
          <PointList title="Please do" points={facts.dos} mark="do" />
          <PointList title="Please don't" points={facts.donts} mark="dont" />
        </div>
      )}

      {facts.timeline?.length ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">What happens, and when</h3>
          <ol className="space-y-0">
            {facts.timeline.map((step, i) => (
              <li key={i} className="flex flex-col gap-0.5 border-t py-2.5 sm:flex-row sm:gap-4">
                <span className="shrink-0 text-sm font-medium sm:w-36">{step.when}</span>
                <span className="text-sm text-muted-foreground">{step.what}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <p className="border-t pt-3 text-xs italic text-muted-foreground">{PATIENT_SUMMARY_DISCLAIMER}</p>
    </div>
  );
}

function PointList({ title, points, mark }: { title: string; points?: string[]; mark: "do" | "dont" }) {
  if (!points?.length) return null;
  const Icon = mark === "do" ? Check : X;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="space-y-1.5">
        {points.map((p, i) => (
          <li key={i} className="flex gap-2 text-sm">
            <Icon
              className={`mt-0.5 h-4 w-4 shrink-0 ${mark === "do" ? "text-success" : "text-destructive"}`}
              aria-hidden
            />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
