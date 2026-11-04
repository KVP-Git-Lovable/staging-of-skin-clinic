import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, Settings, AlertTriangle, Pencil, Copy, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useKnowledgeCategories, useKnowledgeServices, useKnowledgeStats } from "@/hooks/useKnowledge";
import { type KnowledgeArticle } from "@/lib/knowledge";
import { ArticleEditor } from "@/components/knowledge/ArticleEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { toast } from "sonner";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";
import { EngagementMeter } from "@/components/knowledge/ArticleEngagement";

export default function KnowledgeArticles() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin, staffProfile } = useAuth();
  const canEdit = isAdmin || staffProfile?.roleName?.toLowerCase() === "doctor";
  const [service, setService] = useState(params.get("service") || "all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<KnowledgeArticle | "new" | null>(params.get("new") ? "new" : null);
  const [cloning, setCloning] = useState<KnowledgeArticle | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeArticle | null>(null);
  const qc = useQueryClient();
  const { data: services = [] } = useKnowledgeServices();
  const { data: categories = [] } = useKnowledgeCategories();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ["knowledge", "list", service, category, status, search, page], queryFn: async () => {
    let q = supabase.from("knowledge_articles").select("*", { count: "exact" }).is("deleted_at", null).order("updated_at", { ascending: false }).range(page * 30, page * 30 + 29);
    if (service !== "all") q = q.eq("service_id", service);
    if (category !== "all") q = q.eq("category_id", category);
    if (status !== "all") q = q.eq("status", status);
    if (search.trim()) q = q.ilike("title", `%${search.trim()}%`);
    const { data: rows, count, error } = await q;
    if (error) throw error;
    return { rows: rows || [], count: count || 0 };
  }});
  const { data: stats = [] } = useKnowledgeStats(data?.rows.map((a) => a.id) || []);
  const { data: linkedArticle } = useQuery({ queryKey: ["knowledge", "linked", params.get("article")], enabled: !!params.get("article"), queryFn: async () => {
    const { data, error } = await supabase.from("knowledge_articles").select("*").eq("id", params.get("article") || "").is("deleted_at", null).single();
    if (error) throw error; return data;
  }});
  // Kept as a REDIRECT, not removed: ?article=<id> is in saved links and was
  // the only way in before /knowledge/:id existed.
  useEffect(() => { if (linkedArticle) navigate(`/knowledge/${linkedArticle.id}`, { replace: true }); }, [linkedArticle, navigate]);
  const { data: paused } = useQuery({ queryKey: ["knowledge-ai-paused"], enabled: canEdit, queryFn: async () => {
    const { data, error } = await supabase.from("knowledge_ai_state").select("*").maybeSingle();
    if (error) throw error;
    return data;
  }});
  const resume = async () => {
    const { error } = await supabase.from("knowledge_ai_state").delete().eq("id", "knowledge");
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["knowledge-ai-paused"] });
    toast.success("AI pause cleared. Start a new draft when access is restored.");
  };
  return <div className="p-4 md:p-6 space-y-5">
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"><h1 className="text-2xl font-semibold flex items-center gap-2"><BookOpen className="h-6 w-6 text-primary" />Knowledge Articles</h1><div className="flex gap-2">{isAdmin && <Button asChild variant="outline"><Link to="/admin/knowledge-categories"><Settings className="h-4 w-4 mr-2" />Categories</Link></Button>}{canEdit && <Button onClick={() => setEditor("new")}><Plus className="h-4 w-4 mr-2" />New Article</Button>}</div></header>
    {paused && <div className="border-l-4 border-warning bg-warning/10 p-3 text-sm space-y-2"><p>{paused.reason}</p>{isAdmin && <Button variant="outline" size="sm" onClick={resume}>Resume AI after access is restored</Button>}</div>}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Search articles" aria-label="Search articles" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} /></div><SearchableSelect value={service} onChange={(v) => { setService(v); setPage(0); }} options={[{ id: "all", name: "All services" }, ...services]} /><SearchableSelect value={category} onChange={(v) => { setCategory(v); setPage(0); }} options={[{ id: "all", name: "All categories" }, ...categories]} /><SearchableSelect value={status} onChange={(v) => { setStatus(v); setPage(0); }} options={[{ id: "all", name: "All statuses" }, { id: "draft", name: "Draft" }, { id: "reviewed", name: "Reviewed" }, { id: "published", name: "Published" }]} /></div>
    {error ? <div className="py-10 text-center"><p className="text-destructive">{error.message}</p><Button variant="outline" onClick={() => refetch()}>Try again</Button></div> : isLoading ? <p className="py-10 text-muted-foreground text-center">Loading articles…</p> : !data?.rows.length ? <div className="py-16 border-y text-center text-muted-foreground"><BookOpen className="h-8 w-8 mx-auto mb-3" /><p>No knowledge articles found</p></div> : <div className="divide-y border-y">{data.rows.map((a) => <article key={a.id} className="py-4 flex flex-col sm:flex-row items-start justify-between gap-3"><div className="min-w-0 space-y-2"><Button variant="link" className="h-auto p-0 text-left whitespace-normal justify-start text-base" onClick={() => navigate(`/knowledge/${a.id}`)}>{a.is_critical && <AlertTriangle className="h-4 w-4 mr-2 shrink-0 text-destructive" />}{a.title}</Button><p className="text-sm text-muted-foreground">{services.find((s) => s.id === a.service_id)?.name}</p><div className="flex flex-wrap gap-2"><Badge variant="outline" className="whitespace-normal">Category: {categories.find((c) => c.id === a.category_id)?.name}</Badge><Badge variant="secondary">Age: {a.age_rule === "all_ages" ? "All ages" : `${a.min_age}–${a.max_age} years`}</Badge><Badge variant="secondary">Gender: {a.gender === "both" ? "All genders" : a.gender}</Badge></div><p className="text-sm text-muted-foreground line-clamp-2">{a.summary}</p><div className="flex flex-wrap items-center gap-2"><Badge variant={a.status === "published" ? "default" : "secondary"}>{a.status}</Badge>{!a.is_active && <Badge variant="outline">Inactive</Badge>}{a.ai_generated && <Badge variant="outline">AI-assisted</Badge>}</div><EngagementMeter stats={stats.find((s) => s.article_id === a.id)} /></div>{canEdit && <div className="flex shrink-0"><Button size="icon" variant="ghost" title="Edit" aria-label={`Edit ${a.title}`} onClick={() => setEditor(a)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Clone" aria-label={`Clone ${a.title}`} onClick={() => { setCloning(a); setEditor("new"); }}><Copy className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title="Delete" aria-label={`Delete ${a.title}`} onClick={() => setDeleting(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button></div>}</article>)}</div>}
    <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{data?.count || 0} articles</span><div className="flex items-center gap-2"><Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button><span>{page + 1}</span><Button variant="outline" size="sm" disabled={(page + 1) * 30 >= (data?.count || 0)} onClick={() => setPage(page + 1)}>Next</Button></div></div>
    {canEdit && editor && <ArticleEditor article={editor === "new" ? undefined : editor} cloneFrom={cloning || undefined} serviceId={service === "all" ? undefined : service} onClose={() => { setEditor(null); setCloning(null); }} />}
    <DeleteConfirmDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} entity="knowledge article" onConfirm={async () => {
      if (!deleting) return;
      const { error } = await supabase.rpc("trash_knowledge_article", { _id: deleting.id });
      if (error) { toast.error(error.message); throw error; }
      await qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success("Article moved to Trash");
    }} />
  </div>;
}