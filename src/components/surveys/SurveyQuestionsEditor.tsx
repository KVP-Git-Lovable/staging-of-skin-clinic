import { useRef, useState } from "react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { streamImage } from "@/lib/knowledgeImageStream";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SurveyQuestionImage from "@/components/portal/SurveyQuestionImage";
import { illustrationFor } from "@/lib/surveyIllustration";
import {
  QUESTIONS_PER_PAGE_MAX, QUESTIONS_PER_PAGE_MIN, idealAnswerFrom, idealAnswerText, maxChoicesCeiling, questionsPerPage,
} from "@/lib/surveyQuestionConfig";

/**
 * Everything the clinic says about a survey question.
 *
 * Before this, a question was its text, its type and its choices, and the
 * picture above it in the portal was chosen by keyword-matching that text
 * against 37 pictures bundled into the build. The clinic could not pick one,
 * and rewording a question changed its picture by accident.
 *
 * One component, rendered both on Admin > Patient Portal (where the clinic
 * asked for it) and in the Questions tab of the template dialog, so the two
 * cannot drift into disagreeing about what a question is.
 */

export const SURVEY_IMAGE_BUCKET = "survey-images";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export interface EditableQuestion {
  id?: string;
  question_text: string;
  question_type: string;
  options: string[];
  ideal_answer?: unknown;
  sort_order: number;
  image_url?: string | null;
  help_text?: string;
  is_required?: boolean;
  max_choices?: number | null;
  max_length?: number | null;
  is_active?: boolean;
}

const TYPES = [
  { value: "text", label: "Free text" },
  { value: "single_choice", label: "Choose one" },
  { value: "multi_choice", label: "Choose several" },
  { value: "scale", label: "A score out of ten" },
];

const isChoice = (t: string) => t === "single_choice" || t === "multi_choice";

export function SurveyQuestionsEditor({
  questions, onChange, perPage, onPerPageChange, disabled,
}: {
  questions: EditableQuestion[];
  onChange: (next: EditableQuestion[]) => void;
  perPage: number;
  onPerPageChange: (next: number) => void;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState<number | null>(null);
  const fileInputs = useRef<Record<number, HTMLInputElement | null>>({});
  // One generation at a time, with the frame it has reached. Nothing is
  // stored until the clinic presses Keep.
  const [drawing, setDrawing] = useState<number | null>(null);
  const [frame, setFrame] = useState("");
  const [frameDone, setFrameDone] = useState(false);
  const abort = useRef<AbortController | null>(null);
  // Which question the finished frame belongs to: `drawing` goes back to null
  // the moment the stream ends, and the preview has to stay where it was.
  const lastDrawn = useRef<number | null>(null);
  // The whole-survey run: how far it has got, so the clinic can watch it and
  // stop it. Counted in pictures, because that is what it spends.
  const [bulk, setBulk] = useState<{ done: number; total: number } | null>(null);
  const [confirmBulk, setConfirmBulk] = useState(false);

  const update = (i: number, patch: Partial<EditableQuestion>) =>
    onChange(questions.map((q, n) => (n === i ? { ...q, ...patch } : q)));

  const move = (i: number, by: number) => {
    const to = i + by;
    if (to < 0 || to >= questions.length) return;
    const next = [...questions];
    [next[i], next[to]] = [next[to], next[i]];
    onChange(next.map((q, n) => ({ ...q, sort_order: n })));
  };

  const add = () =>
    onChange([...questions, {
      question_text: "", question_type: "text", options: [], ideal_answer: {},
      sort_order: questions.length, image_url: null, help_text: "",
      is_required: true, max_choices: null, max_length: null, is_active: true,
    }]);

  /**
   * Removing a saved question would take its answers with it, so a question
   * that has ever been saved is retired instead. Only a draft nobody has
   * answered is actually dropped.
   */
  const remove = (i: number) => {
    const q = questions[i];
    if (q.id) {
      update(i, { is_active: false });
      toast.success("Retired. It is no longer asked, and past answers are kept.");
      return;
    }
    onChange(questions.filter((_, n) => n !== i).map((x, n) => ({ ...x, sort_order: n })));
  };

  /**
   * Write the picture onto the question itself, now.
   *
   * It used to live in local state until somebody pressed Save, and four
   * generated pictures were lost that way - made, paid for, and gone on the
   * next reload. A picture that costs a credit must not depend on a button
   * being remembered.
   *
   * A question with no id has no row to write to yet; that one is still
   * carried to the database by Save, which is the only thing that can create
   * it.
   */
  const persist = async (q: EditableQuestion, imageUrl: string | null) => {
    if (!q.id) return;
    const { data, error } = await supabase
      .from("survey_questions")
      .update({ image_url: imageUrl })
      .eq("id", q.id)
      .select("id");
    if (error) throw error;
    // A refusal by the row-level rule matches no rows rather than erroring,
    // and the clinic would be told it saved when nothing moved.
    if (!data?.length) throw new Error("Nothing was saved. This needs permission to edit surveys.");
  };

  /** Put the picture in the bucket and hand back its public URL. */
  const store = async (file: File): Promise<string> => {
    const ext = (file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "");
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(SURVEY_IMAGE_BUCKET).upload(path, file, {
      cacheControl: "3600", upsert: false,
    });
    if (error) throw error;
    return supabase.storage.from(SURVEY_IMAGE_BUCKET).getPublicUrl(path).data.publicUrl;
  };

  /** One picture, from the question to a stored URL. No preview, no Keep. */
  const generateOne = async (q: EditableQuestion, signal: AbortSignal, accessToken: string) => {
    let finished = "";
    await streamImage(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/survey-question-image`,
      { question_id: q.id },
      (url, complete) => { if (complete) finished = url; },
      signal,
      { Authorization: `Bearer ${accessToken}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
    );
    if (!finished) throw new Error("No picture came back.");
    const blob = await (await fetch(finished)).blob();
    return store(new File([blob], "survey-question.png", { type: "image/png" }));
  };

  /**
   * A picture for every question that has none.
   *
   * Never touches a question that already has one - a picture the clinic
   * chose is not something a bulk button may overwrite. Stops at the first
   * failure rather than pressing on: the usual reason is the AI running out
   * of credit, and every call after it would fail the same way.
   */
  const generateMissing = async () => {
    const targets = questions
      .map((q, i) => ({ q, i }))
      .filter(({ q }) => q.id && q.question_text.trim() && !q.image_url && q.is_active !== false);
    if (!targets.length) { toast.info("Every question already has a picture."); return; }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in."); return; }

    abort.current = new AbortController();
    setBulk({ done: 0, total: targets.length });
    let next = [...questions];
    let made = 0;
    try {
      for (const { q, i } of targets) {
        if (abort.current.signal.aborted) break;
        setDrawing(i);
        const url = await generateOne(q, abort.current.signal, session.access_token);
        await persist(q, url);
        next = next.map((x, n) => (n === i ? { ...x, image_url: url } : x));
        onChange(next);
        made += 1;
        setBulk({ done: made, total: targets.length });
      }
      if (made > 0) {
        toast.success(`${made} picture${made === 1 ? "" : "s"} made and saved.`);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") {
        if (made > 0) toast.success(`Stopped. The ${made} already made ${made === 1 ? "is" : "are"} saved.`);
      } else {
        toast.error(
          `${(e as Error).message || "Could not make a picture."}${made > 0 ? ` ${made} made before it stopped.` : ""}`,
        );
      }
    } finally {
      setDrawing(null);
      setBulk(null);
    }
  };

  const generate = async (i: number) => {
    const q = questions[i];
    if (!q.question_text.trim()) { toast.error("Give the question its wording first."); return; }
    if (!q.id) { toast.error("Save the survey once, then a picture can be made for this question."); return; }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in."); return; }

    abort.current = new AbortController();
    lastDrawn.current = i;
    setDrawing(i); setFrame(""); setFrameDone(false);
    try {
      await streamImage(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/survey-question-image`,
        { question_id: q.id },
        (url, complete) => { setFrame(url); setFrameDone(complete); },
        abort.current.signal,
        {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      );
    } catch (e) {
      setFrame(""); setFrameDone(false);
      if (!(e instanceof Error && e.name === "AbortError")) {
        toast.error(e instanceof Error ? e.message : "Could not make a picture.");
      }
    } finally {
      setDrawing(null);
    }
  };

  const keepFrame = async (i: number) => {
    setUploading(i);
    try {
      const blob = await (await fetch(frame)).blob();
      const url = await store(new File([blob], "survey-question.png", { type: "image/png" }));
      await persist(questions[i], url);
      update(i, { image_url: url });
      setFrame(""); setFrameDone(false);
      toast.success(questions[i].id ? "Picture saved." : "Picture kept. Save the survey to keep it.");
    } catch (e) {
      toast.error((e as Error).message || "The picture could not be kept.");
    } finally {
      setUploading(null);
    }
  };

  const upload = async (i: number, file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("That is not an image."); return; }
    if (file.size > MAX_IMAGE_BYTES) { toast.error("Images must be under 5 MB."); return; }
    setUploading(i);
    try {
      const url = await store(file);
      await persist(questions[i], url);
      update(i, { image_url: url });
      toast.success(questions[i].id ? "Picture saved." : "Picture added. Save the survey to keep it.");
    } catch (e) {
      toast.error((e as Error).message || "Upload failed.");
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border p-3">
        <div className="space-y-1">
          <Label className="text-sm">Questions on one page</Label>
          <p className="text-xs text-muted-foreground">
            How many a patient answers before tapping Next. One at a time is how it reads today.
          </p>
        </div>
        <Select
          value={String(questionsPerPage(perPage))}
          onValueChange={(v) => onPerPageChange(questionsPerPage(Number(v)))}
          disabled={disabled}
        >
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Array.from({ length: QUESTIONS_PER_PAGE_MAX - QUESTIONS_PER_PAGE_MIN + 1 }, (_, n) => n + QUESTIONS_PER_PAGE_MIN)
              .map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* A picture for every question that has none. Each one spends an AI
          credit, so it says how many before it starts. */}
      {(() => {
        const missing = questions.filter(
          (q) => q.id && q.question_text.trim() && !q.image_url && q.is_active !== false,
        ).length;
        return (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
            <div className="flex-1 min-w-[14rem]">
              <p className="text-sm font-medium">Pictures</p>
              <p className="text-xs text-muted-foreground">
                {bulk
                  ? `Making picture ${bulk.done + 1} of ${bulk.total}…`
                  : missing === 0
                    ? "Every question has a picture."
                    : `${missing} question${missing === 1 ? " has" : "s have"} no picture of their own.`}
              </p>
            </div>
            {bulk ? (
              <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>Stop</Button>
            ) : (
              <Button
                size="sm" variant="outline"
                disabled={disabled || missing === 0 || drawing !== null}
                onClick={() => setConfirmBulk(true)}
              >
                <Sparkles className="h-3.5 w-3.5 mr-1" /> Generate the missing ones
              </Button>
            )}
          </div>
        );
      })()}

      <AlertDialog open={confirmBulk} onOpenChange={setConfirmBulk}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a picture for every question without one?</AlertDialogTitle>
            <AlertDialogDescription>
              {questions.filter((q) => q.id && q.question_text.trim() && !q.image_url && q.is_active !== false).length}
              {" pictures, one per question, each made from that question's wording. Each one spends an AI credit. "}
              A question that already has a picture is left alone, and you can stop part way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not now</AlertDialogCancel>
            <AlertDialogAction onClick={() => void generateMissing()}>Make them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {questions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No questions yet. Add the first one below.
        </p>
      )}

      {questions.map((q, i) => {
        const retired = q.is_active === false;
        const choice = isChoice(q.question_type);
        return (
          <div
            key={q.id ?? `draft-${i}`}
            className={`rounded-lg border p-4 space-y-3 ${retired ? "opacity-60 bg-muted/30" : "bg-muted/20"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">
                Q{i + 1}{retired && " — retired, not asked"}
              </span>
              <div className="flex items-center gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move up"
                        disabled={disabled || i === 0} onClick={() => move(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7" aria-label="Move down"
                        disabled={disabled || i === questions.length - 1} onClick={() => move(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
                {retired ? (
                  <Button size="sm" variant="ghost" className="h-7 text-xs"
                          disabled={disabled} onClick={() => update(i, { is_active: true })}>
                    Ask again
                  </Button>
                ) : (
                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                          aria-label="Retire question" disabled={disabled} onClick={() => remove(i)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>

            <Input
              value={q.question_text}
              placeholder="What are you asking?"
              disabled={disabled}
              onChange={(e) => update(i, { question_text: e.target.value })}
            />

            <Textarea
              value={q.help_text ?? ""}
              placeholder="Help text under the question (optional)"
              rows={2}
              disabled={disabled}
              onChange={(e) => update(i, { help_text: e.target.value })}
            />

            <div className="flex flex-wrap items-center gap-3">
              <Select value={q.question_type} disabled={disabled}
                      onValueChange={(v) => update(i, { question_type: v, max_choices: null })}>
                <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>

              <div className="flex items-center gap-2">
                <Switch id={`req-${i}`} checked={q.is_required ?? true} disabled={disabled}
                        onCheckedChange={(v) => update(i, { is_required: v })} />
                <Label htmlFor={`req-${i}`} className="text-sm">Must be answered</Label>
              </div>

              {q.question_type === "multi_choice" && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">At most</Label>
                  <Input
                    type="number" className="w-20" min={1} max={maxChoicesCeiling({ id: q.id ?? "draft", question_type: q.question_type, options: q.options })}
                    value={q.max_choices ?? ""} placeholder="any" disabled={disabled}
                    onChange={(e) => update(i, {
                      max_choices: e.target.value === "" ? null : Number(e.target.value),
                    })}
                  />
                </div>
              )}

              {q.question_type === "text" && (
                <div className="flex items-center gap-2">
                  <Label className="text-sm">Characters</Label>
                  <Input
                    type="number" className="w-24" min={1} max={5000}
                    value={q.max_length ?? ""} placeholder="any" disabled={disabled}
                    onChange={(e) => update(i, {
                      max_length: e.target.value === "" ? null : Number(e.target.value),
                    })}
                  />
                </div>
              )}
            </div>

            {choice && (
              <Input
                value={q.options.join(", ")}
                placeholder="The choices, separated by commas"
                disabled={disabled}
                onChange={(e) => update(i, {
                  options: e.target.value.split(",").map((o) => o.trim()).filter(Boolean),
                })}
              />
            )}

            {/* What a good answer looks like. Never shown to the patient: the
                recommendation AI compares each answer against it. */}
            <div className="space-y-1">
              <Label htmlFor={`ideal-${i}`} className="text-xs">
                {q.question_type === "scale"
                  ? "Ideal score (1-10)"
                  : q.question_type === "text"
                    ? "Ideal answer (keywords or expected response)"
                    : "Ideal answer"}
              </Label>
              <Input
                id={`ideal-${i}`}
                type={q.question_type === "scale" ? "number" : "text"}
                min={q.question_type === "scale" ? 1 : undefined}
                max={q.question_type === "scale" ? 10 : undefined}
                value={idealAnswerText(q.ideal_answer)}
                placeholder={q.question_type === "text" ? "Expected keywords or answer" : "The ideal/expected answer"}
                disabled={disabled}
                onChange={(e) => update(i, { ideal_answer: idealAnswerFrom(q.question_type, e.target.value) })}
              />
            </div>

            {/* The picture. Without one the portal shows the illustration it
                has always shown, so this says which, rather than leaving the
                clinic to guess what a patient sees. */}
            <div className="flex items-start gap-3 border-t pt-3">
              <div className="w-32 shrink-0">
                {q.image_url ? (
                  <img src={q.image_url} alt="" className="h-20 w-32 rounded-lg object-cover" />
                ) : (
                  <SurveyQuestionImage
                    name={illustrationFor(q.question_text, q.question_type)}
                    className="h-20"
                  />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {q.image_url
                    ? "Your picture."
                    : "No picture chosen, so the portal shows this one, picked from the question's wording."}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    ref={(el) => { fileInputs.current[i] = el; }}
                    type="file" accept="image/*" className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) void upload(i, file);
                    }}
                  />
                  <Button size="sm" variant="outline" disabled={disabled || uploading === i || drawing !== null}
                          onClick={() => fileInputs.current[i]?.click()}>
                    {uploading === i
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Uploading…</>
                      : <><ImagePlus className="h-3.5 w-3.5 mr-1" /> {q.image_url ? "Replace" : "Upload"}</>}
                  </Button>

                  {/* Make one that matches the question, rather than hunting
                      for a photo. Each press is one generation. */}
                  <Button
                    size="sm" variant="outline"
                    disabled={disabled || drawing !== null || uploading === i || !q.question_text.trim()}
                    title={q.question_text.trim() ? "Make a picture from this question" : "Write the question first"}
                    onClick={() => void generate(i)}
                  >
                    {drawing === i
                      ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Drawing…</>
                      : <><Sparkles className="h-3.5 w-3.5 mr-1" /> {q.image_url ? "Regenerate" : "Generate"}</>}
                  </Button>

                  {drawing === i && (
                    <Button size="sm" variant="ghost" onClick={() => abort.current?.abort()}>
                      Stop
                    </Button>
                  )}

                  {q.image_url && drawing !== i && (
                    <Button size="sm" variant="ghost" disabled={disabled}
                            onClick={async () => {
                              try {
                                await persist(q, null);
                                update(i, { image_url: null });
                              } catch (e) {
                                toast.error((e as Error).message || "The picture could not be removed.");
                              }
                            }}>
                      <X className="h-3.5 w-3.5 mr-1" /> Remove
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {(drawing === i || (frame && frameDone && lastDrawn.current === i)) && frame && (
              <div className="space-y-2 border-t pt-3">
                <img
                  src={frame}
                  alt="A picture being made for this question"
                  className={`h-40 w-full rounded-lg object-cover ${frameDone ? "" : "blur-md"}`}
                />
                {frameDone && (
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs text-muted-foreground flex-1 min-w-[12rem]">
                      Made by AI from the question's wording. Look at it before keeping it.
                    </p>
                    <Button size="sm" disabled={uploading === i} onClick={() => void keepFrame(i)}>
                      {uploading === i
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Keeping…</>
                        : "Keep"}
                    </Button>
                    <Button size="sm" variant="ghost" disabled={uploading === i}
                            onClick={() => { setFrame(""); setFrameDone(false); }}>
                      Discard
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      <Button variant="outline" className="w-full" disabled={disabled} onClick={add}>
        <Plus className="h-4 w-4 mr-1" /> Add a question
      </Button>
    </div>
  );
}
