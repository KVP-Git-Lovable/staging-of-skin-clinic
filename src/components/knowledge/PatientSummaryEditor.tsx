import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { draftPatientSummary } from "@/lib/knowledgeAi";
import {
  aiWriteLabel, editableFacts, FACT_CARDS, factCards, patientFacts, type PatientFacts, type TimelineStep,
} from "@/lib/patientSummary";
import { PatientSummary } from "./PatientSummary";
import { PATIENT_SUMMARY_SECTION_ID } from "./ArticleEditor";

/**
 * Writing the patient's version, inside the article editor.
 *
 * The AI button rewrites the clinical fields AS THEY STAND IN THE FORM, unsaved
 * edits included: the doctor is choosing those words now, and a patient summary
 * written from the saved copy would explain the previous version of the
 * treatment.
 *
 * Same two-step gate as the article draft - the suggestion is shown as a
 * preview, "Accept into draft" only writes React state, and nothing reaches the
 * database until the clinician presses one of the editor's save buttons. The
 * editor's `onBusyChange` keeps those buttons disabled while this is streaming,
 * so a half-arrived summary cannot be saved.
 *
 * The lists are edited one line at a time rather than as free text, because the
 * cards, the ticks and the handout are drawn from the structure. A textarea
 * would make the clinician responsible for a format they cannot see.
 */

const LIST_LIMIT = 8;
const TIMELINE_LIMIT = 6;

export function PatientSummaryEditor({
  summary, facts, source, autoStart, onChange, onBusyChange,
}: {
  summary: string;
  facts: unknown;
  /** The clinical fields as they stand in the form - what gets rewritten. */
  source: { title: string; summary: string; clinical_protocol: string; contraindications: string; pre_post_care: string; complications_management: string };
  /** Opened from "Write patient summary": start writing without a second click. */
  autoStart?: boolean;
  onChange: (next: { patient_summary: string; patient_facts: PatientFacts }) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  // Drawn from the raw draft, not patientFacts: the cleaned-up version drops
  // blank rows and trailing spaces, which made "Add" and typing a second word
  // impossible. Saving cleans it (ArticleEditor), so nothing padded is stored.
  const parsed = editableFacts(facts);
  // What the patient would actually see, for "is anything written yet?".
  const clean = patientFacts(facts);
  const [proposal, setProposal] = useState<{ patient_summary: string; patient_facts: PatientFacts; ai_change_summary: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>();
  const started = useRef(false);
  useEffect(() => () => abort.current?.abort(), []);
  const written = !!summary.trim() || !!factCards(clean).length || !!clean.dos?.length || !!clean.donts?.length || !!clean.timeline?.length;

  const setFacts = (next: PatientFacts) => onChange({ patient_summary: summary, patient_facts: next });

  const generate = async () => {
    if (!source.clinical_protocol.trim() && !source.summary.trim()) {
      toast.error("Write or generate the clinical article first");
      return;
    }
    setBusy(true); onBusyChange(true);
    abort.current = new AbortController();
    try {
      const result = await draftPatientSummary(source, abort.current.signal);
      setProposal({
        patient_summary: result.patient_summary,
        patient_facts: patientFacts(result.patient_facts),
        ai_change_summary: result.ai_change_summary,
      });
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally { setBusy(false); onBusyChange(false); }
  };

  /**
   * Opened from the article's "Write patient summary" button: start writing.
   *
   * The ref, not the effect's dependency list, is what guarantees one request.
   * Every call costs the clinic credits, and this component re-renders on every
   * keystroke in the fields below, so "fire once" has to be a latch rather than
   * a promise about when effects run.
   *
   * Never over existing content: a doctor who already has a summary opened the
   * editor to change it by hand, not to have it replaced on arrival. They can
   * still press Rewrite with AI.
   */
  useEffect(() => {
    if (!autoStart || started.current || written) return;
    started.current = true;
    void generate();
    // generate and written are read once, at the latch; adding them would
    // re-run this on each keystroke, which the latch would then swallow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  if (proposal) {
    return (
      <section className="space-y-4 rounded-lg border p-4">
        <h2 className="font-semibold">Review the patient summary</h2>
        {proposal.ai_change_summary && (
          <p className="text-sm text-warning whitespace-pre-wrap">{proposal.ai_change_summary}</p>
        )}
        <p className="text-xs text-muted-foreground">
          Written from this article's own text, with no web research. Check it says nothing the clinical
          article does not, and nothing a patient could read as a promise.
        </p>
        <div className="rounded-md border p-4">
          <PatientSummary article={{ patient_summary: proposal.patient_summary, patient_facts: proposal.patient_facts, resources: [] }} />
        </div>
        <div className="flex gap-2">
          <Button onClick={() => { onChange({ patient_summary: proposal.patient_summary, patient_facts: proposal.patient_facts }); setProposal(null); }}>
            Accept into draft
          </Button>
          <Button variant="outline" onClick={() => setProposal(null)}>Discard suggestion</Button>
        </div>
      </section>
    );
  }

  return (
    <section id={PATIENT_SUMMARY_SECTION_ID} className="space-y-4 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold">Patient summary</h2>
          <p className="text-xs text-muted-foreground">Plain words for the patient, shown on screen and printed as a handout.</p>
        </div>
        <div className="flex gap-2">
          {/* Never the same words as the button on the article page that opens
              this - see aiWriteLabel. */}
          <Button variant="outline" size="sm" onClick={generate} disabled={busy}>
            <Sparkles className="h-4 w-4 mr-2" />{aiWriteLabel(written)}
          </Button>
          {busy && <Button variant="ghost" size="sm" onClick={() => abort.current?.abort()}><Loader2 className="h-4 w-4 mr-2 animate-spin" />Stop</Button>}
        </div>
      </div>

      {busy && (
        // Said out loud. The model reasons before it answers, so this is several
        // seconds in which a silent screen looks like a button that did nothing.
        <div className="flex items-start gap-3 rounded-md border bg-muted/40 p-4" data-testid="patient-summary-working">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-primary motion-reduce:animate-none" />
          <div className="space-y-1">
            <p className="text-sm font-medium">Writing the patient summary…</p>
            <p className="text-xs text-muted-foreground">
              Reading this article's clinical text and putting it in plain words. This takes a few seconds.
            </p>
          </div>
        </div>
      )}

      <div>
        <Label htmlFor="patient-summary">In plain words</Label>
        <Textarea
          id="patient-summary" rows={5} value={summary}
          placeholder="What the treatment is, what it does, and what to expect — as you would say it to the patient."
          onChange={(e) => onChange({ patient_summary: e.target.value, patient_facts: parsed })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FACT_CARDS.map(([key, label]) => (
          <div key={key}>
            <Label htmlFor={`fact-${key}`} className="text-xs">{label}</Label>
            <Input
              id={`fact-${key}`} value={parsed[key] ?? ""} maxLength={120}
              onChange={(e) => {
                const next = { ...parsed };
                // Dropped rather than stored blank, so the card is not drawn
                // empty beside filled ones.
                if (e.target.value.trim()) next[key] = e.target.value; else delete next[key];
                setFacts(next);
              }}
            />
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PointsEditor label="Please do" points={parsed.dos} onChange={(dos) => setFacts({ ...parsed, dos })} />
        <PointsEditor label="Please don't" points={parsed.donts} onChange={(donts) => setFacts({ ...parsed, donts })} />
      </div>

      <TimelineEditor steps={parsed.timeline} onChange={(timeline) => setFacts({ ...parsed, timeline })} />
    </section>
  );
}

function PointsEditor({ label, points = [], onChange }: { label: string; points?: string[]; onChange: (points: string[] | undefined) => void }) {
  const set = (next: string[]) => onChange(next.length ? next : undefined);
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {points.map((p, i) => (
        <div key={i} className="flex gap-2">
          <Input value={p} maxLength={200} onChange={(e) => set(points.map((v, j) => (j === i ? e.target.value : v)))} />
          <Button variant="ghost" size="icon" aria-label={`Remove point ${i + 1}`} onClick={() => set(points.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {points.length < LIST_LIMIT && (
        <Button variant="outline" size="sm" onClick={() => set([...points, ""])}><Plus className="h-4 w-4 mr-1" />Add</Button>
      )}
    </div>
  );
}

function TimelineEditor({ steps = [], onChange }: { steps?: TimelineStep[]; onChange: (steps: TimelineStep[] | undefined) => void }) {
  const set = (next: TimelineStep[]) => onChange(next.length ? next : undefined);
  return (
    <div className="space-y-2">
      <Label className="text-xs">What happens, and when</Label>
      {steps.map((s, i) => (
        <div key={i} className="flex flex-col gap-2 sm:flex-row">
          <Input className="sm:w-44" maxLength={60} placeholder="Before / On the day / After" value={s.when}
            onChange={(e) => set(steps.map((v, j) => (j === i ? { ...v, when: e.target.value } : v)))} />
          <Input maxLength={300} placeholder="What happens then" value={s.what}
            onChange={(e) => set(steps.map((v, j) => (j === i ? { ...v, what: e.target.value } : v)))} />
          <Button variant="ghost" size="icon" aria-label={`Remove step ${i + 1}`} onClick={() => set(steps.filter((_, j) => j !== i))}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {steps.length < TIMELINE_LIMIT && (
        <Button variant="outline" size="sm" onClick={() => set([...steps, { when: "", what: "" }])}><Plus className="h-4 w-4 mr-1" />Add step</Button>
      )}
    </div>
  );
}
