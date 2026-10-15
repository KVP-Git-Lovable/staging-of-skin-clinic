import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { readMetaApiError } from "@/lib/metaErrors";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2 } from "lucide-react";
import {
  LEAD_LOCALE_OPTIONS,
  LEAD_QUESTION_CHOICES,
  draftToLeadForm,
  emptyLeadFormDraft,
  validateLeadFormDraft,
  type LeadFormDraft,
  type LeadFormRow,
  type LeadQuestionDraft,
} from "@/lib/metaLeadForms";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  onCreated: (form: LeadFormRow) => void;
}

let qid = 10;
const newQuestion = (type = "CUSTOM"): LeadQuestionDraft => ({ id: `q${qid++}`, type, label: "", options: type === "CUSTOM_MULTIPLE" ? ["", ""] : [] });

/**
 * Builds a Meta instant form (POST /{page-id}/leadgen_forms) through meta-api `create_lead_form`.
 * Field names follow Meta's Lead Forms guide; the form cannot be edited on Meta afterwards.
 */
export function LeadFormDialog({ open, onOpenChange, pageId, onCreated }: Props) {
  const [d, setD] = useState<LeadFormDraft>(emptyLeadFormDraft);
  const [saving, setSaving] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const errors = validateLeadFormDraft(d);
  const patch = (p: Partial<LeadFormDraft>) => setD((cur) => ({ ...cur, ...p }));
  const patchQ = (id: string, p: Partial<LeadQuestionDraft>) => setD((cur) => ({ ...cur, questions: cur.questions.map((q) => (q.id === id ? { ...q, ...p } : q)) }));
  const moveQ = (idx: number, dir: -1 | 1) => setD((cur) => {
    const next = [...cur.questions];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return cur;
    [next[idx], next[j]] = [next[j], next[idx]];
    return { ...cur, questions: next };
  });

  const create = async () => {
    if (errors.length) { toast({ title: "Please fix the form", description: errors[0], variant: "destructive" }); return; }
    setSaving(true);
    const { data, error } = await supabase.functions.invoke("meta-api", { body: { action: "create_lead_form", payload: { page_id: pageId, form: draftToLeadForm(d) } } });
    setSaving(false);
    if (error || data?.error) { toast({ title: "Meta did not create the form", description: await readMetaApiError(error, data), variant: "destructive" }); return; }
    if (data.pending) toast({ title: "Lead form saved", description: "It will be sent to Meta automatically once the permissions and Lead Ads Terms are in place. You can already pick it on the ad." });
    else toast({ title: "Lead form created on Meta", description: `Form id ${data.form?.external_id}` });
    onCreated(data.form as LeadFormRow);
    setD(emptyLeadFormDraft());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create Lead form</DialogTitle>
          <DialogDescription>
            An instant form people fill in without leaving Facebook or Instagram. It is created on your Page through Meta's Marketing API and cannot be edited afterwards, only archived.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2"><Label>Form name *</Label><Input value={d.name} onChange={(e) => patch({ name: e.target.value })} placeholder="e.g. Skin consultation enquiry" /></div>

          <div className="sm:col-span-2 border-t pt-3">
            <h3 className="text-sm font-medium">Intro (optional)</h3>
            <p className="text-xs text-muted-foreground">Shown before the questions (Meta: context_card).</p>
          </div>
          <div className="space-y-1.5"><Label>Intro title</Label><Input value={d.intro_title} onChange={(e) => patch({ intro_title: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Style</Label>
            <Select value={d.intro_style} onValueChange={(v) => patch({ intro_style: v as LeadFormDraft["intro_style"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="LIST_STYLE">Bullet list</SelectItem><SelectItem value="PARAGRAPH_STYLE">Paragraph</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Intro lines (one per line)</Label><Textarea rows={3} value={d.intro_lines} onChange={(e) => patch({ intro_lines: e.target.value })} placeholder={"Up to 25% off lab-grown diamonds\nVisit our Mangalore store"} /></div>
          <div className="space-y-1.5"><Label>Intro button text</Label><Input value={d.intro_button} onChange={(e) => patch({ intro_button: e.target.value })} placeholder="Continue" /></div>
          <div className="space-y-1.5"><Label>Questions page headline</Label><Input value={d.headline} onChange={(e) => patch({ headline: e.target.value })} placeholder="Tell us how to reach you" /></div>

          <div className="sm:col-span-2 border-t pt-3 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium">Questions *</h3>
              <p className="text-xs text-muted-foreground">Name, e-mail and phone are pre-filled by Meta from the person's profile.</p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => setD((cur) => ({ ...cur, questions: [...cur.questions, newQuestion()] }))}><Plus className="h-4 w-4 mr-1" />Add question</Button>
          </div>
          <div className="sm:col-span-2 space-y-2">
            {d.questions.map((q, idx) => {
              const choice = LEAD_QUESTION_CHOICES.find((c) => c.type === q.type);
              return (
                <div key={q.id} className="rounded-md border p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-5">{idx + 1}.</span>
                    <Select value={q.type} onValueChange={(v) => patchQ(q.id, { type: v, options: v === "CUSTOM_MULTIPLE" ? (q.options.length ? q.options : ["", ""]) : [] })}>
                      <SelectTrigger className="h-8 flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{LEAD_QUESTION_CHOICES.map((c) => <SelectItem key={c.type} value={c.type}>{c.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveQ(idx, -1)} disabled={idx === 0}><ArrowUp className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveQ(idx, 1)} disabled={idx === d.questions.length - 1}><ArrowDown className="h-4 w-4" /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => setD((cur) => ({ ...cur, questions: cur.questions.filter((x) => x.id !== q.id) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                  {choice?.custom && (
                    <Input className="h-8" value={q.label} onChange={(e) => patchQ(q.id, { label: e.target.value })} placeholder="Question text, e.g. Preferred treatment" />
                  )}
                  {choice?.multiple && (
                    <div className="space-y-1 pl-5">
                      {q.options.map((o, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <Input className="h-8" value={o} onChange={(e) => patchQ(q.id, { options: q.options.map((x, i) => (i === oi ? e.target.value : x)) })} placeholder={`Option ${oi + 1}`} />
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => patchQ(q.id, { options: q.options.filter((_, i) => i !== oi) })} disabled={q.options.length <= 2}><Trash2 className="h-4 w-4" /></Button>
                        </div>
                      ))}
                      <Button type="button" size="sm" variant="ghost" onClick={() => patchQ(q.id, { options: [...q.options, ""] })}><Plus className="h-4 w-4 mr-1" />Option</Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div className="sm:col-span-2 border-t pt-3">
            <h3 className="text-sm font-medium">Privacy policy *</h3>
            <p className="text-xs text-muted-foreground">Meta requires every instant form to link to your privacy policy.</p>
          </div>
          <div className="space-y-1.5"><Label>Privacy policy URL (https)</Label><Input type="url" value={d.privacy_url} onChange={(e) => patch({ privacy_url: e.target.value })} placeholder="https://yourdomain.com/privacy" /></div>
          <div className="space-y-1.5"><Label>Link text</Label><Input value={d.privacy_link_text} onChange={(e) => patch({ privacy_link_text: e.target.value })} /></div>

          <div className="sm:col-span-2 border-t pt-3 flex items-start gap-2">
            <Checkbox id="ty-on" checked={d.thank_you_enabled} onCheckedChange={(c) => patch({ thank_you_enabled: c === true })} className="mt-0.5" />
            <div><Label htmlFor="ty-on" className="text-sm font-medium">Thank-you page</Label><p className="text-xs text-muted-foreground">Shown after the form is submitted.</p></div>
          </div>
          {d.thank_you_enabled && (
            <>
              <div className="space-y-1.5"><Label>Title *</Label><Input value={d.thank_you_title} onChange={(e) => patch({ thank_you_title: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Button</Label>
                <Select value={d.thank_you_button_type} onValueChange={(v) => patch({ thank_you_button_type: v as LeadFormDraft["thank_you_button_type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="VIEW_WEBSITE">View website</SelectItem><SelectItem value="CALL_BUSINESS">Call business</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2"><Label>Body</Label><Textarea rows={2} value={d.thank_you_body} onChange={(e) => patch({ thank_you_body: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Button text</Label><Input value={d.thank_you_button_text} onChange={(e) => patch({ thank_you_button_text: e.target.value })} /></div>
              {d.thank_you_button_type === "VIEW_WEBSITE" ? (
                <div className="space-y-1.5"><Label>Website URL *</Label><Input type="url" value={d.thank_you_website_url} onChange={(e) => patch({ thank_you_website_url: e.target.value })} placeholder="https://" /></div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-1.5 col-span-2"><Label>Phone *</Label><Input value={d.thank_you_phone} onChange={(e) => patch({ thank_you_phone: e.target.value })} placeholder="+919876543210" /></div>
                  <div className="space-y-1.5"><Label>Country *</Label><Input value={d.thank_you_country} onChange={(e) => patch({ thank_you_country: e.target.value })} placeholder="IN" /></div>
                </div>
              )}
            </>
          )}

          <div className="sm:col-span-2 border-t pt-3"><h3 className="text-sm font-medium">Settings</h3></div>
          <div className="space-y-1.5"><Label>Language</Label>
            <Select value={d.locale} onValueChange={(v) => patch({ locale: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{LEAD_LOCALE_OPTIONS.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={d.optimized_for_quality} onCheckedChange={(c) => patch({ optimized_for_quality: c === true })} className="mt-0.5" /><span>Higher intent <span className="block text-xs text-muted-foreground">Adds a review step before submitting (is_optimized_for_quality).</span></span></label>
            <label className="flex items-start gap-2 text-sm"><Checkbox checked={d.block_non_targeted} onCheckedChange={(c) => patch({ block_non_targeted: c === true })} className="mt-0.5" /><span>Only people the ad targets can open the form <span className="block text-xs text-muted-foreground">Blocks organic sharing (block_display_for_non_targeted_viewer).</span></span></label>
          </div>

          {errors.length > 0 && (
            <div className="sm:col-span-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
              {errors.map((e) => <div key={e}>• {e}</div>)}
            </div>
          )}
          <div className="sm:col-span-2">
            <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setShowJson((s) => !s)}>{showJson ? "Hide" : "Show"} what will be sent to Meta</button>
            {showJson && <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">{JSON.stringify(draftToLeadForm(d), null, 2)}</pre>}
          </div>
        </div>

        <DialogFooter>
          <Badge variant="outline" className="mr-auto">Page {pageId}</Badge>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={create} disabled={saving || errors.length > 0}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create on Meta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
