import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Plus, Search, Settings, SlidersHorizontal, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useKnowledgeCategories, useKnowledgeServices, useKnowledgeStats } from "@/hooks/useKnowledge";
import { type KnowledgeArticle } from "@/lib/knowledge";
import {
  AUDIENCE_OPTIONS,
  DEFAULT_FILTERS,
  SORT_OPTIONS,
  STATUS_OPTIONS,
  clearedFilters,
  hasActiveFilters,
  resultSummary,
  searchOrFilter,
  sortQuery,
  type ArticleFilters,
} from "@/lib/knowledgeBrowse";
import { ArticleEditor } from "@/components/knowledge/ArticleEditor";
import { ArticleCard } from "@/components/knowledge/ArticleCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/components/shared/SearchableSelect";
import { toast } from "sonner";
import DeleteConfirmDialog from "@/components/shared/DeleteConfirmDialog";

const PAGE_SIZE = 24;

/** One labelled control in the filter bar, so every column reads the same. */
function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export default function KnowledgeArticles() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { isAdmin, staffProfile } = useAuth();
  const canEdit = isAdmin || staffProfile?.roleName?.toLowerCase() === "doctor";
  const [filters, setFilters] = useState<ArticleFilters>({
    ...DEFAULT_FILTERS,
    service: params.get("service") || "all",
  });
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<KnowledgeArticle | "new" | null>(params.get("new") ? "new" : null);
  const [cloning, setCloning] = useState<KnowledgeArticle | null>(null);
  const [deleting, setDeleting] = useState<KnowledgeArticle | null>(null);
  const qc = useQueryClient();
  const { data: services = [] } = useKnowledgeServices();
  const { data: categories = [] } = useKnowledgeCategories();

  /** Any change to a filter puts the reader back on the first page. */
  const set = (patch: Partial<ArticleFilters>) => { setFilters((f) => ({ ...f, ...patch })); setPage(0); };

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["knowledge", "list", filters, page],
    queryFn: async () => {
      const order = sortQuery(filters.sort);
      let q = supabase.from("knowledge_articles").select("*", { count: "exact" }).is("deleted_at", null);
      if (filters.service !== "all") q = q.eq("service_id", filters.service);
      if (filters.category !== "all") q = q.eq("category_id", filters.category);
      if (filters.status !== "all") q = q.eq("status", filters.status);
      // Audience is two axes in one list, so it narrows on whichever it is.
      if (filters.audience === "all_ages") q = q.eq("age_rule", "all_ages");
      if (filters.audience === "age_range") q = q.neq("age_rule", "all_ages");
      if (["both", "female", "male"].includes(filters.audience)) q = q.eq("gender", filters.audience);
      if (filters.search.trim()) q = q.or(searchOrFilter(filters.search));
      // Sorted in SQL, not in the browser: the list is paged, so sorting the
      // rows already fetched would reorder the page rather than the library.
      q = q.order(order.column, { ascending: order.ascending, nullsFirst: order.nullsFirst })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
      const { data: rows, count, error } = await q;
      if (error) throw error;
      return { rows: rows || [], count: count || 0 };
    },
  });

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

  const narrowed = hasActiveFilters(filters);
  const clear = () => { setFilters(clearedFilters()); setPage(0); };

  return <div className="p-4 md:p-6 space-y-5">
    <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
      <h1 className="font-display text-2xl font-semibold flex items-center gap-2"><BookOpen className="h-6 w-6 text-primary" />Knowledge Articles</h1>
      <div className="flex gap-2">
        {isAdmin && <Button asChild variant="outline"><Link to="/admin/knowledge-categories"><Settings className="h-4 w-4 mr-2" />Categories</Link></Button>}
        {canEdit && <Button onClick={() => setEditor("new")}><Plus className="h-4 w-4 mr-2" />New Article</Button>}
      </div>
    </header>

    {paused && <div className="border-l-4 border-warning bg-warning/10 p-3 text-sm space-y-2"><p>{paused.reason}</p>{isAdmin && <Button variant="outline" size="sm" onClick={resume}>Resume AI after access is restored</Button>}</div>}

    <section className="rounded-xl border bg-card p-4 shadow-sm md:p-5" aria-label="Filter articles">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-primary" />Filter Articles
        </h2>
        <Button variant="outline" size="sm" onClick={clear} disabled={!narrowed}>
          <X className="h-3.5 w-3.5 mr-1.5" />Clear Filters
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Field label="Service">
          <SearchableSelect value={filters.service} onChange={(service) => set({ service })} options={[{ id: "all", name: "All services" }, ...services]} />
        </Field>
        <Field label="Category">
          <SearchableSelect value={filters.category} onChange={(category) => set({ category })} options={[{ id: "all", name: "All categories" }, ...categories]} />
        </Field>
        <Field label="Status">
          <SearchableSelect value={filters.status} onChange={(status) => set({ status })} options={STATUS_OPTIONS} />
        </Field>
        <Field label="Audience">
          <SearchableSelect value={filters.audience} onChange={(audience) => set({ audience })} options={AUDIENCE_OPTIONS} />
        </Field>
        <Field label="Search" htmlFor="knowledge-search">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input id="knowledge-search" className="pl-8" placeholder="Search articles…" aria-label="Search articles" value={filters.search} onChange={(e) => set({ search: e.target.value })} />
          </div>
        </Field>
        <Field label="Sort By">
          <SearchableSelect value={filters.sort} onChange={(sort) => set({ sort })} options={SORT_OPTIONS} />
        </Field>
      </div>
    </section>

    {error ? (
      <div className="py-10 text-center"><p className="text-destructive">{error.message}</p><Button variant="outline" onClick={() => refetch()}>Try again</Button></div>
    ) : isLoading ? (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {/* Cards, not a line of text: the grid keeps its shape while it loads
            rather than jumping into place underneath the reader. */}
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="overflow-hidden rounded-xl border bg-card shadow-sm">
            <Skeleton className="h-36 w-full rounded-none" />
            <div className="space-y-2 p-4">
              <Skeleton className="h-4 w-24" /><Skeleton className="h-5 w-full" /><Skeleton className="h-4 w-5/6" /><Skeleton className="h-4 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    ) : !data?.rows.length ? (
      <div className="rounded-xl border border-dashed py-16 text-center">
        <BookOpen className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-muted-foreground">{narrowed ? "No articles match these filters" : "No knowledge articles yet"}</p>
        {narrowed && <Button variant="outline" size="sm" className="mt-3" onClick={clear}>Clear Filters</Button>}
      </div>
    ) : (
      <>
        <p className="text-sm text-muted-foreground">{resultSummary(data.count, filters)}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {data.rows.map((a) => (
            <ArticleCard
              key={a.id}
              article={a}
              serviceName={services.find((s) => s.id === a.service_id)?.name}
              categoryName={categories.find((c) => c.id === a.category_id)?.name}
              stats={stats.find((s) => s.article_id === a.id)}
              canEdit={canEdit}
              onOpen={() => navigate(`/knowledge/${a.id}`)}
              onEdit={() => setEditor(a)}
              onClone={() => { setCloning(a); setEditor("new"); }}
              onDelete={() => setDeleting(a)}
            />
          ))}
        </div>
      </>
    )}

    {/* Only when there is somewhere to page to. The count is already printed
        above the grid, so a second one here beside a dead Previous/Next was
        two pieces of furniture doing nothing. */}
    {(data?.count || 0) > PAGE_SIZE && (
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Page {page + 1} of {Math.ceil((data?.count || 0) / PAGE_SIZE)}</span>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
          <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= (data?.count || 0)} onClick={() => setPage(page + 1)}>Next</Button>
        </div>
      </div>
    )}

    {canEdit && editor && <ArticleEditor article={editor === "new" ? undefined : editor} cloneFrom={cloning || undefined} serviceId={filters.service === "all" ? undefined : filters.service} onClose={() => { setEditor(null); setCloning(null); }} />}
    <DeleteConfirmDialog open={!!deleting} onOpenChange={(open) => { if (!open) setDeleting(null); }} entity="knowledge article" onConfirm={async () => {
      if (!deleting) return;
      const { error } = await supabase.rpc("trash_knowledge_article", { _id: deleting.id });
      if (error) { toast.error(error.message); throw error; }
      await qc.invalidateQueries({ queryKey: ["knowledge"] }); toast.success("Article moved to Trash");
    }} />
  </div>;
}
