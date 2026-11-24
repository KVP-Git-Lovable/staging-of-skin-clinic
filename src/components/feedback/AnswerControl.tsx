import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  answerControl, EMOJI_FACES, questionChoices, questionMaxLength, questionScale,
  type AnswerValue, type FeedbackQuestion,
} from "@/lib/feedbackQuestions";

/**
 * One feedback question, drawn.
 *
 * The clinic's Feedback tab and the patient portal both use this, so the
 * patient sees the same thing whichever screen it is on and a new answer type
 * only has to be built once. Before this there were two hand-written copies of
 * three questions, and the five-star row existed inline in five files with
 * four different colours between them.
 *
 * An unknown answer type lands on the text box rather than nothing - see
 * answerControl. A form that silently drops a question is worse than one that
 * asks it plainly.
 */

export function AnswerControl({
  question, value, onChange, disabled,
}: {
  question: FeedbackQuestion;
  value: AnswerValue;
  onChange: (value: AnswerValue) => void;
  disabled?: boolean;
}) {
  const control = answerControl(question);

  if (control === "stars") {
    const { max } = questionScale(question);
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            className="p-1 transition-transform hover:scale-110 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none"
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-pressed={value === n}
          >
            <Star
              className={cn(
                "h-7 w-7",
                typeof value === "number" && n <= value
                  ? "fill-warning text-warning"
                  : "text-muted-foreground/30 hover:text-warning/60",
              )}
            />
          </button>
        ))}
      </div>
    );
  }

  if (control === "emoji") {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        {EMOJI_FACES.map((face, i) => {
          const n = i + 1;
          return (
            <button
              key={face}
              type="button"
              disabled={disabled}
              onClick={() => onChange(n)}
              aria-label={`${n} out of ${EMOJI_FACES.length}`}
              aria-pressed={value === n}
              className={cn(
                "h-11 w-11 rounded-full border text-2xl leading-none transition-transform hover:scale-110 disabled:opacity-50 motion-reduce:transform-none motion-reduce:transition-none",
                value === n ? "border-primary bg-primary/10 scale-110" : "border-transparent",
              )}
            >
              {face}
            </button>
          );
        })}
      </div>
    );
  }

  if (control === "scale") {
    const { min, max } = questionScale(question);
    return (
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: max - min + 1 }, (_, i) => min + i).map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => onChange(n)}
            aria-label={`${n} out of ${max}`}
            aria-pressed={value === n}
            className={cn(
              "h-10 w-10 rounded-md border text-sm font-medium transition-colors disabled:opacity-50",
              value === n ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent",
            )}
          >
            {n}
          </button>
        ))}
      </div>
    );
  }

  if (control === "yes_no") {
    return (
      <div className="flex gap-2">
        {[true, false].map((answer) => (
          <Button
            key={String(answer)}
            type="button"
            size="sm"
            disabled={disabled}
            variant={value === answer ? "default" : "outline"}
            onClick={() => onChange(answer)}
          >
            {answer ? "Yes" : "No"}
          </Button>
        ))}
      </div>
    );
  }

  if (control === "choice_one") {
    return (
      <div className="flex flex-wrap gap-2">
        {questionChoices(question).map((choice) => (
          <Button
            key={choice}
            type="button"
            size="sm"
            disabled={disabled}
            variant={value === choice ? "default" : "outline"}
            onClick={() => onChange(choice)}
          >
            {choice}
          </Button>
        ))}
      </div>
    );
  }

  if (control === "choice_many") {
    const chosen = Array.isArray(value) ? value : [];
    return (
      <div className="space-y-2">
        {questionChoices(question).map((choice) => (
          <Label key={choice} className="flex items-center gap-2 font-normal">
            <Checkbox
              checked={chosen.includes(choice)}
              disabled={disabled}
              onCheckedChange={(on) =>
                onChange(on ? [...chosen, choice] : chosen.filter((c) => c !== choice))
              }
            />
            {choice}
          </Label>
        ))}
      </div>
    );
  }

  return (
    <Textarea
      rows={3}
      disabled={disabled}
      maxLength={questionMaxLength(question)}
      value={typeof value === "string" ? value : ""}
      onChange={(e) => onChange(e.target.value)}
      placeholder="In their own words…"
    />
  );
}

/** The same answer, read back. Used wherever recorded feedback is displayed. */
export function AnswerReadout({ question, value }: { question: FeedbackQuestion; value: AnswerValue }) {
  const control = answerControl(question);
  if (value === null || value === undefined || value === "") {
    return <span className="text-muted-foreground">—</span>;
  }
  if (control === "stars") {
    const { max } = questionScale(question);
    return (
      <span className="flex items-center gap-0.5" aria-label={`${value} out of ${max}`}>
        {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
          <Star
            key={n}
            className={cn("h-4 w-4", typeof value === "number" && n <= value ? "fill-warning text-warning" : "text-muted-foreground/30")}
            aria-hidden
          />
        ))}
      </span>
    );
  }
  if (control === "emoji" && typeof value === "number") {
    return <span className="text-xl" aria-label={`${value} out of ${EMOJI_FACES.length}`}>{EMOJI_FACES[value - 1] ?? "—"}</span>;
  }
  if (control === "yes_no") return <span>{value ? "Yes" : "No"}</span>;
  if (Array.isArray(value)) return <span>{value.join(", ")}</span>;
  return <span className="whitespace-pre-wrap">{String(value)}</span>;
}
