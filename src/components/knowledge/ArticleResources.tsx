import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ExternalLink, FileText, Film, ImageIcon, Paperclip, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { articleResources, resourceSchema, type KnowledgeResource } from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/shared/SearchableSelect";

const bucket = "knowledge-attachments";
export async function uploadKnowledgeFile(file: File, group: string): Promise<KnowledgeResource> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Please sign in");
  if (file.size > 20 * 1024 * 1024) throw new Error("Each attachment must be 20 MB or smaller");
  const extensions = ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "jpg", "jpeg", "png", "webp", "gif", "mp4", "webm", "mov"];
  const ext = file.name.split(".").pop()?.toLowerCase() || "";
  if (!extensions.includes(ext)) throw new Error("Choose a document, picture or video file");
  const path = `${user.id}/${group}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  return { id: crypto.randomUUID(), kind: ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? "image" : ["mp4", "webm", "mov"].includes(ext) ? "video" : "file", title: file.name, path };
}
function ResourceView({ resource }: { resource: KnowledgeResource }) {
  const { data: url, error } = useQuery({ queryKey: ["knowledge-resource-url", resource.path], enabled: !!resource.path, staleTime: 30 * 60 * 1000, queryFn: async () => {
    if (!resource.path) return null;
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(resource.path, 3600);
    if (error) throw error;
    return data.signedUrl;
  }});
  const Icon = resource.kind === "image" ? ImageIcon : resource.kind === "video" ? Film : resource.kind === "file" ? FileText : ExternalLink;
  const href = resource.path ? url : resource.url;
  return <div className="space-y-2 min-w-0">
    {resource.kind === "article" ? <Button asChild variant="link" className="p-0 h-auto whitespace-normal"><Link to={`/knowledge/${resource.article_id}`}>{resource.title}</Link></Button> : href ? <a href={href} target="_blank" rel="noopener noreferrer" className="flex gap-2 items-start text-primary underline underline-offset-4 break-words"><Icon className="h-4 w-4 shrink-0 mt-0.5" />{resource.title}</a> : <p className="text-muted-foreground">{error ? "Attachment unavailable" : "Loading attachment…"}</p>}
    {resource.kind === "image" && href && <img src={href} alt={resource.title} loading="lazy" className="max-h-80 max-w-full object-contain rounded-md" />}
    {resource.kind === "video" && resource.path && href && <video controls preload="metadata" src={href} className="max-h-80 w-full" />}
    {resource.note && <p className="text-sm whitespace-pre-wrap text-muted-foreground">{resource.note}</p>}
    {resource.source_url && <a href={resource.source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary underline">Source / attribution</a>}
  </div>;
}
/**
 * @param heading The section title, or null for no heading and no top border.
 *   ArticleContent now renders pictures with the article and everything else
 *   at the end, so the picture group asks for null - a "Attachments & further
 *   reading" header over a single diagram, mid-article, reads as the end of
 *   the page. Signed-URL fetching stays in one place either way: an uploaded
 *   picture lives in a private bucket and only ResourceView knows how to sign
 *   for it.
 */
export function ArticleResources({ value, heading = "Attachments & further reading" }: { value: unknown; heading?: string | null }) {
  const resources = articleResources(value);
  if (!resources.length) return null;
  return <section className={heading ? "space-y-4 border-t pt-4" : "space-y-4"}>{heading && <h3 className="font-semibold flex items-center gap-2"><Paperclip className="h-4 w-4" />{heading}</h3>}{resources.map((r) => <ResourceView key={r.id} resource={r} />)}</section>;
}
export function ResourceEditor({ value, onChange, group, onBusyChange }: { value: KnowledgeResource[]; onChange: (value: KnowledgeResource[]) => void; group: string; onBusyChange?: (busy: boolean) => void }) {
  const [kind, setKind] = useState<"link" | "video" | "image" | "article">("link");
  const [title, setTitle] = useState(""); const [url, setUrl] = useState(""); const [note, setNote] = useState("");
  const [related, setRelated] = useState(""); const [busy, setBusy] = useState(false);
  const { data: articles = [] } = useQuery({ queryKey: ["knowledge", "related-options"], queryFn: async () => {
    const { data, error } = await supabase.from("knowledge_articles").select("id,title").is("deleted_at", null).order("title").limit(1000);
    if (error) throw error; return (data || []).map((a) => ({ id: a.id, name: a.title }));
  }});
  const add = () => {
    if (value.length >= 50) { toast.error("Maximum 50 resources per article"); return; }
    const parsed = resourceSchema.safeParse({ id: crypto.randomUUID(), kind, title: title || articles.find((a) => a.id === related)?.name, ...(kind === "article" ? { article_id: related } : { url }), note });
    if (!parsed.success) { toast.error("Enter a title and valid web link or select an article"); return; }
    onChange([...value, parsed.data]); setTitle(""); setUrl(""); setNote(""); setRelated("");
  };
  return <section className="space-y-3 border-t pt-4"><h2 className="font-semibold">Attachments, links & videos</h2>
    <Label className="flex items-center gap-2 text-primary cursor-pointer"><Upload className="h-4 w-4" />{busy ? "Uploading attachments…" : "Attach files"}<input type="file" multiple disabled={busy} className="sr-only" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov" onChange={async (e) => {
      const files = Array.from(e.target.files || []); e.target.value = "";
      if (value.length + files.length > 50) { toast.error("Maximum 50 resources per article"); return; }
      setBusy(true); onBusyChange?.(true); const added: KnowledgeResource[] = [];
      try { for (const file of files) added.push(await uploadKnowledgeFile(file, group)); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Attachment upload failed"); }
      finally { onChange([...value, ...added]); setBusy(false); onBusyChange?.(false); }
    }} /></Label>
    {value.map((r) => <div key={r.id} className="flex items-start justify-between gap-3 border-b py-2"><div className="min-w-0"><p className="text-sm font-medium break-words">{r.title}</p><p className="text-xs text-muted-foreground break-all">{r.kind} · {r.note || r.url || "Attached file"}</p></div><Button size="icon" variant="ghost" aria-label={`Remove ${r.title}`} onClick={() => onChange(value.filter((v) => v.id !== r.id))}><Trash2 className="h-4 w-4" /></Button></div>)}
    <div className="grid sm:grid-cols-2 gap-3"><Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}><SelectTrigger aria-label="Resource type"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="link">Reference link</SelectItem><SelectItem value="video">Video link</SelectItem><SelectItem value="image">Picture link</SelectItem><SelectItem value="article">Related knowledge article</SelectItem></SelectContent></Select><Input placeholder="Reference title" aria-label="Reference title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} /></div>
    {kind === "article" ? <SearchableSelect value={related} onChange={setRelated} options={articles} placeholder="Choose related article" /> : <Input type="url" aria-label="Reference URL" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} />}
    <Textarea aria-label="Reference guide notes" placeholder="Reference guide notes" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} />
    <Button size="sm" variant="outline" onClick={add}><Plus className="h-4 w-4 mr-2" />Add reference</Button>
  </section>;
}