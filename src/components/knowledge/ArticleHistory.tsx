import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { type KnowledgeArticle, revisionChanges } from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { ArticleContent } from "./ArticleContent";

export function ArticleHistory({ article }: { article: KnowledgeArticle }) {
  const [limit, setLimit] = useState(20);
  const { data, error } = useQuery({ queryKey: ["knowledge-revisions", article.id, limit], queryFn: async () => {
    const { data, error, count } = await supabase.from("knowledge_article_revisions").select("*", { count: "exact" }).eq("article_id", article.id).order("revision", { ascending: false }).limit(limit + 1);
    if (error) throw error;
    const ids = [...new Set([article.created_by, article.updated_by, ...(data || []).map((r) => r.changed_by)].filter((v): v is string => !!v))];
    const { data: staff } = ids.length ? await supabase.from("staff").select("auth_user_id,first_name,last_name").in("auth_user_id", ids) : { data: [] };
    return { rows: data || [], count: count || 0, names: Object.fromEntries((staff || []).map((s) => [s.auth_user_id, `${s.first_name} ${s.last_name}`.trim()])) };
  }});
  const name = (id: string | null, saved?: string | null) => saved || (id ? data?.names[id] : null) || "Staff member";
  const time = (value: string) => new Date(value).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  return <section className="border-t pt-4 space-y-3"><div className="text-xs text-muted-foreground space-y-1"><p>Created by {name(article.created_by, article.created_by_name)} · {time(article.created_at)} IST</p><p>Modified by {name(article.updated_by, article.updated_by_name)} · {time(article.updated_at)} IST</p></div><details><summary className="cursor-pointer font-medium">Revision history</summary>{error && <p className="text-destructive text-sm">{error.message}</p>}{data?.rows.slice(0, limit).map((r, index) => {
    const snapshot = r.snapshot as Record<string, unknown>; const previous = data.rows[index + 1]?.snapshot as Record<string, unknown> | undefined;
    const changes = r.changes && Object.keys(r.changes).length ? r.changes as Record<string, { before: unknown; after: unknown }> : previous ? revisionChanges(previous, snapshot) : { created: { before: null, after: snapshot.title } };
    return <details key={r.id} className="py-3 border-b"><summary className="cursor-pointer text-sm">Revision {r.revision} · {name(r.changed_by, r.changed_by_name)} · {time(r.changed_at)} IST</summary><div className="space-y-3 mt-3">{Object.entries(changes).map(([key, change]) => <div key={key} className="text-xs"><p className="font-semibold capitalize">{key.split("_").join(" ")}</p><div className="grid sm:grid-cols-2 gap-3"><pre className="whitespace-pre-wrap break-words text-muted-foreground max-h-60 overflow-auto">Before: {typeof change.before === "string" ? change.before : JSON.stringify(change.before, null, 2)}</pre><pre className="whitespace-pre-wrap break-words max-h-60 overflow-auto">After: {typeof change.after === "string" ? change.after : JSON.stringify(change.after, null, 2)}</pre></div></div>)}<details><summary className="text-xs cursor-pointer">Full article at this revision</summary><ArticleContent article={snapshot as unknown as KnowledgeArticle} /></details></div></details>;
  })}{!!data && data.count > limit && <Button size="sm" variant="outline" onClick={() => setLimit(limit + 20)}>Load older revisions</Button>}</details></section>;
}