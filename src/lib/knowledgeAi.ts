import { supabase } from "@/integrations/supabase/client";
import { z } from "zod";
import { resourceSchema } from "./knowledge";
const Proposal = z.object({ title: z.string(), summary: z.string(), clinical_protocol: z.string(), contraindications: z.string(), pre_post_care: z.string(), complications_management: z.string(), sources: z.string(), is_critical: z.boolean(), ai_change_summary: z.string(), resources: z.array(resourceSchema).default([]) });
export type KnowledgeProposal = Required<z.infer<typeof Proposal>>;
/**
 * One NDJSON request to knowledge-ai, reassembled.
 *
 * Shared by the article draft and the patient summary. The partial-line buffer
 * is the part that matters: a network chunk boundary falls wherever it likes,
 * routinely mid-JSON, so the tail after the last newline is carried to the next
 * read rather than parsed. `onEvent` takes the events a particular caller cares
 * about; everything returns the accumulated text.
 */
async function streamKnowledgeAi(
  body: unknown,
  signal: AbortSignal,
  onEvent: (event: { type: string; [k: string]: unknown }) => void = () => {},
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Please sign in");
  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-ai`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, body: JSON.stringify(body), signal });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || "Knowledge AI is unavailable");
  }
  if (!response.body) throw new Error("No AI response received");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "", text = "";
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "delta") text += event.text;
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      lines.forEach(consume);
      if (done) break;
    }
    consume(buffer);
  } finally { await reader.cancel().catch(() => {}); }
  return text;
}

/** A model sometimes wraps its JSON in a markdown fence. Strip it. */
const unfence = (text: string) => text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");

export async function draftKnowledge(body: unknown, signal: AbortSignal): Promise<KnowledgeProposal> {
  let webSources: { title: string; url: string }[] = [];
  let relatedArticles: { id: string; title: string }[] = [];
  const text = await streamKnowledgeAi(body, signal, (event) => {
    if (event.type === "sources") webSources = event.sources as typeof webSources;
    if (event.type === "related") relatedArticles = event.articles as typeof relatedArticles;
  });
  const raw = JSON.parse(unfence(text));
  raw.resources = (raw.resources || []).map((r: Record<string, unknown>) => ({ ...r, id: crypto.randomUUID() }));
  const proposal = Proposal.parse(raw) as KnowledgeProposal;
  const seen = new Set(proposal.resources.map((r) => r.url));
  for (const source of webSources) {
    if (!seen.has(source.url)) { proposal.resources.push({ id: crypto.randomUUID(), kind: "link", title: source.title || source.url, url: source.url, note: "Source retrieved during AI web research" }); seen.add(source.url); }
  }
  if (webSources.length) proposal.sources += "\n\n### Web research sources\n" + webSources.map((s) => `- [${s.title || s.url}](${s.url})`).join("\n");
  proposal.resources.push(...relatedArticles.map((a) => ({ id: crypto.randomUUID(), kind: "article" as const, title: a.title, article_id: a.id, note: "Related published service knowledge article" })));
  return proposal;
}

/**
 * The patient's version of the article currently in the editor.
 *
 * Sends the clinical fields as they stand - unsaved edits included, because the
 * doctor is writing them now and the patient version should follow the words
 * they just chose. Nothing is persisted here: the result is a proposal the
 * clinician accepts into the draft and then saves, exactly like the article
 * draft, so no patient-facing text reaches the database unreviewed.
 */
const PatientProposal = z.object({
  patient_summary: z.string(),
  patient_facts: z.unknown().default({}),
  ai_change_summary: z.string().default(""),
});
export type PatientSummaryProposal = z.infer<typeof PatientProposal>;

export async function draftPatientSummary(
  article: { title: string; summary: string; clinical_protocol: string; contraindications: string; pre_post_care: string; complications_management: string },
  signal: AbortSignal,
): Promise<PatientSummaryProposal> {
  const text = await streamKnowledgeAi({ action: "patient_summary", article }, signal);
  return PatientProposal.parse(JSON.parse(unfence(text)));
}