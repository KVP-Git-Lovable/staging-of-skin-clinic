import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Sparkles, ShieldCheck, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { articleResources, suggestedArticleTitle, clinicalFields, cloneArticle, type KnowledgeArticle, type KnowledgeResource } from "@/lib/knowledge";
import { draftKnowledge, type KnowledgeProposal } from "@/lib/knowledgeAi";
import { useKnowledgeCategories, useKnowledgeServices } from "@/hooks/useKnowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { ArticleContent } from "./ArticleContent";
import { ResourceEditor } from "./ArticleResources";
import { ArticleHistory } from "./ArticleHistory";
import { ArticleEngagement } from "./ArticleEngagement";
import { KnowledgePicture } from "./KnowledgePicture";

const blank = { service_id: "", category_id: "", title: "", summary: "", gender: "both", age_rule: "all_ages", min_age: null as number | null, max_age: null as number | null, is_critical: false, clinical_protocol: "", contraindications: "", pre_post_care: "", complications_management: "", sources: "", ai_generated: false, ai_change_summary: "", status: "draft", is_active: true };
export function ArticleEditor({ article, cloneFrom, serviceId, onClose }: { article?: KnowledgeArticle; cloneFrom?: KnowledgeArticle; serviceId?: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...blank, ...(cloneFrom ? cloneArticle(cloneFrom) : {}), ...article, service_id: article?.service_id || cloneFrom?.service_id || serviceId || "" });
  const [resources, setResources] = useState<KnowledgeResource[]>(articleResources(article?.resources || cloneFrom?.resources));
  const [titleEdited, setTitleEdited] = useState(!!article || !!cloneFrom);
  const [group] = useState(() => crypto.randomUUID());
  const [proposal, setProposal] = useState<KnowledgeProposal | null>(null);
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController>();
  useEffect(() => () => abort.current?.abort(), []);
  const { data: categories = [] } = useKnowledgeCategories();
  const { data: services = [] } = useKnowledgeServices();
  useEffect(() => {
    if (!titleEdited) setForm((f) => ({ ...f, title: suggestedArticleTitle(services.find((s) => s.id === f.service_id)?.name || "", f) }));
  }, [form.service_id, form.gender, form.age_rule, form.min_age, form.max_age, titleEdited, services]);
  const save = useMutation({ mutationFn: async (status: string) => {
    if (!form.service_id || !form.category_id || !form.title.trim()) throw new Error("Service, category and title are required");
    if (form.age_rule === "custom_range" && (form.min_age === null || form.max_age === null || form.min_age < 0 || form.max_age < form.min_age)) throw new Error("Enter minimum and maximum ages");
    const editable = Object.fromEntries(Object.keys(blank).map((key) => [key, form[key as keyof typeof blank]])) as typeof blank;
    const payload = { ...editable, resources: JSON.parse(JSON.stringify(resources)), title: form.title.trim(), status, min_age: form.age_rule === "all_ages" ? null : form.min_age, max_age: form.age_rule === "all_ages" ? null : form.max_age };
    const request = article ? supabase.from("knowledge_articles").update(payload).eq("id", article.id).eq("revision", article.revision).is("deleted_at", null) : supabase.from("knowledge_articles").insert(payload);
    const { data, error } = await request.select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("This article changed. Reopen it before saving.");
  }, onSuccess: async () => { await Promise.all([qc.invalidateQueries({ queryKey: ["knowledge"] }), qc.invalidateQueries({ queryKey: ["knowledge-revisions", article?.id] })]); toast.success("Article saved"); onClose(); }, onError: (e: Error) => toast.error(e.message) });
  const generate = async () => {
    if (!form.service_id || !form.category_id) { toast.error("Choose a service and category first"); return; }
    abort.current = new AbortController(); setBusy(true);
    try { setProposal(await draftKnowledge({ service_id: form.service_id, category_id: form.category_id, gender: form.gender, age_rule: form.age_rule, min_age: form.min_age, max_age: form.max_age, current: form.clinical_protocol ? { title: form.title, summary: form.summary, ...Object.fromEntries(clinicalFields.map(([key]) => [key, form[key]])), is_critical: form.is_critical } : null }, abort.current.signal)); }
    catch (e) { if (!(e instanceof Error && e.name === "AbortError")) toast.error(e instanceof Error ? e.message : "AI draft failed"); }
    finally { setBusy(false); }
  };
  return <Sheet open onOpenChange={(open) => { if (!open) onClose(); }}><SheetContent className="w-screen sm:max-w-5xl overflow-y-auto">
    <SheetHeader><SheetTitle>{article ? "Edit Knowledge Article" : cloneFrom ? "Clone Knowledge Article" : "New Knowledge Article"}</SheetTitle></SheetHeader>
    <div className="space-y-5 py-5">
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Service *</Label><SearchableSelect value={form.service_id} onChange={(service_id) => setForm({ ...form, service_id })} options={services} placeholder="Choose service" /></div>
        <div className="space-y-1"><Label>Category *</Label><SearchableSelect value={form.category_id} onChange={(category_id) => setForm({ ...form, category_id })} options={categories.filter((c) => c.is_active || c.id === form.category_id)} placeholder="Choose category" /></div>
      </div>
      <div className="space-y-1"><Label htmlFor="article-title">Title *</Label><Input id="article-title" value={form.title} onChange={(e) => { setTitleEdited(true); setForm({ ...form, title: e.target.value }); }} /><Button size="sm" variant="link" className="p-0 h-auto" onClick={() => setTitleEdited(false)}>Use service / age / gender title</Button></div>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1"><Label>Gender</Label><Select value={form.gender} onValueChange={(gender) => setForm({ ...form, gender })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{[["both", "Both / all genders"], ["female", "Female"], ["male", "Male"], ["other", "Other"]].map(([v, n]) => <SelectItem value={v} key={v}>{n}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1"><Label>Age eligibility</Label><Select value={form.age_rule} onValueChange={(age_rule) => setForm({ ...form, age_rule })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all_ages">All ages</SelectItem><SelectItem value="custom_range">Age range</SelectItem></SelectContent></Select></div>
      </div>
      {form.age_rule === "custom_range" && <div className="grid grid-cols-2 gap-4">{(["min_age", "max_age"] as const).map((key) => <div key={key}><Label htmlFor={key}>{key === "min_age" ? "Minimum age" : "Maximum age"}</Label><Input id={key} type="number" min={0} max={150} value={form[key] ?? ""} onChange={(e) => setForm({ ...form, [key]: e.target.value === "" ? null : Number(e.target.value) })} /></div>)}</div>}
      <div className="flex flex-wrap gap-5"><Label className="flex items-center gap-2"><Switch checked={form.is_critical} onCheckedChange={(is_critical) => setForm({ ...form, is_critical })} />Critical safety alert</Label><Label className="flex items-center gap-2"><Switch checked={form.is_active} onCheckedChange={(is_active) => setForm({ ...form, is_active })} />Active</Label></div>
      <div className="flex flex-wrap gap-2 border-y py-3"><Button variant="outline" onClick={generate} disabled={busy || save.isPending}><Sparkles className="h-4 w-4 mr-2" />{form.clinical_protocol ? "AI Enrich & Review" : "Generate AI Draft"}</Button>{busy && <Button variant="ghost" onClick={() => abort.current?.abort()}><Loader2 className="h-4 w-4 mr-2 animate-spin" />Stop</Button>}</div>
      {proposal ? <section className="space-y-4"><h2 className="font-semibold">Review AI suggestion</h2><p className="text-sm text-warning whitespace-pre-wrap">{proposal.ai_change_summary}</p><div className="grid md:grid-cols-2 gap-5"><div className="min-w-0"><h3 className="font-medium mb-3">Current article</h3><ArticleContent article={{ ...form, resources }} /></div><div className="min-w-0 border-l pl-4"><h3 className="font-medium mb-3">Proposed article · {proposal.title}</h3><ArticleContent article={proposal} /></div></div><div className="flex gap-2"><Button onClick={() => { const { resources: suggested, ...content } = proposal; setForm({ ...form, ...content, title: form.title, ai_generated: true, status: "draft" }); setResources([...resources, ...articleResources(suggested)].slice(0, 50)); setProposal(null); }}>Accept into draft</Button><Button variant="outline" onClick={() => setProposal(null)}>Discard suggestion</Button></div></section> : <>
        <div><Label htmlFor="article-summary">Summary</Label><Textarea id="article-summary" rows={3} value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></div>
        {clinicalFields.map(([key, label]) => <div key={key}><Label htmlFor={`article-${key}`}>{label}</Label><Textarea id={`article-${key}`} rows={key === "clinical_protocol" ? 8 : 4} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} /></div>)}
        {form.ai_change_summary && <p className="text-sm text-muted-foreground whitespace-pre-wrap">AI change summary: {form.ai_change_summary}</p>}
      </>}
      {!proposal && <ResourceEditor value={resources} onChange={setResources} group={group} onBusyChange={setBusy} />}
      {!proposal && <KnowledgePicture serviceId={form.service_id} group={group} onBusyChange={setBusy} onAdd={(resource) => setResources((current) => [...current, resource])} />}
      <div className="flex flex-wrap gap-2 border-t pt-4"><Button variant="outline" disabled={save.isPending || busy || !!proposal} onClick={() => save.mutate("draft")}><Save className="h-4 w-4 mr-2" />Save Draft</Button><Button variant="outline" disabled={save.isPending || busy || !!proposal} onClick={() => save.mutate("reviewed")}><ShieldCheck className="h-4 w-4 mr-2" />Mark Reviewed</Button><Button disabled={save.isPending || busy || !!proposal} onClick={() => { if (window.confirm("Confirm you have clinically reviewed this article and approve it for patient appointments?")) save.mutate("published"); }}><BookOpen className="h-4 w-4 mr-2" />Approve & Publish</Button></div>
      <Button variant="ghost" onClick={onClose}>Cancel</Button>
      {article && <><ArticleHistory article={article} /><ArticleEngagement articleId={article.id} trackOpen={false} /></>}
    </div>
  </SheetContent></Sheet>;
}