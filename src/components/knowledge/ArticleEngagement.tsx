import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, MessageSquare, ThumbsDown, ThumbsUp, Send } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useKnowledgeStats } from "@/hooks/useKnowledge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export type ArticleStats = { likes: number; dislikes: number; comments: number; opens: number };
export function EngagementMeter({ stats }: { stats?: ArticleStats }) {
  return <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1" title="Likes"><ThumbsUp className="h-3.5 w-3.5" />{stats?.likes || 0}</span><span className="inline-flex items-center gap-1" title="Dislikes"><ThumbsDown className="h-3.5 w-3.5" />{stats?.dislikes || 0}</span><span className="inline-flex items-center gap-1" title="Comments"><MessageSquare className="h-3.5 w-3.5" />{stats?.comments || 0}</span><span className="inline-flex items-center gap-1" title="Times opened"><Eye className="h-3.5 w-3.5" />{stats?.opens || 0} opens</span></div>;
}
export function ArticleEngagement({ articleId, trackOpen = true }: { articleId: string; trackOpen?: boolean }) {
  const { user, isAdmin, staffProfile } = useAuth(); const qc = useQueryClient();
  const canRespond = isAdmin || staffProfile?.roleName?.toLowerCase() === "doctor";
  const [comment, setComment] = useState(""); const [busy, setBusy] = useState(false); const [page, setPage] = useState(0);
  const eventId = useRef(crypto.randomUUID()); const attempted = useRef(false);
  const { data: stats } = useKnowledgeStats([articleId]);
  useEffect(() => {
    if (!trackOpen || !user || attempted.current) return;
    attempted.current = true;
    void supabase.from("knowledge_article_opens").insert({ id: eventId.current, article_id: articleId, user_id: user.id }).then(({ error }) => {
      if (!error) void qc.invalidateQueries({ queryKey: ["knowledge-stats"] });
      else if (error.code !== "23505") toast.error("Article open count could not be recorded");
    });
  }, [articleId, trackOpen, user, qc]);
  const { data: vote } = useQuery({ queryKey: ["knowledge-vote", articleId, user?.id], enabled: !!user, queryFn: async () => {
    if (!user) return null;
    const { data, error } = await supabase.from("knowledge_article_votes").select("vote").eq("article_id", articleId).eq("user_id", user.id).maybeSingle();
    if (error) throw error; return data?.vote;
  }});
  const { data: comments, error } = useQuery({ queryKey: ["knowledge-comments", articleId, page], queryFn: async () => {
    const { data, count, error } = await supabase.from("knowledge_article_comments").select("*", { count: "exact" }).eq("article_id", articleId).order("created_at", { ascending: false }).range(page * 10, page * 10 + 9);
    if (error) throw error; return { rows: data || [], count: count || 0 };
  }});
  const rate = async (value: number) => {
    if (!user) return; setBusy(true);
    try {
      const result = vote === value ? await supabase.from("knowledge_article_votes").delete().eq("article_id", articleId).eq("user_id", user.id) : await supabase.from("knowledge_article_votes").upsert({ article_id: articleId, user_id: user.id, vote: value }, { onConflict: "article_id,user_id" });
      if (result.error) throw result.error;
      await Promise.all([qc.invalidateQueries({ queryKey: ["knowledge-stats"] }), qc.invalidateQueries({ queryKey: ["knowledge-vote", articleId] })]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Feedback could not be saved"); } finally { setBusy(false); }
  };
  return <section className="border-t pt-4 space-y-4"><h3 className="font-semibold">Doctor feedback</h3><EngagementMeter stats={stats?.[0]} />
    {canRespond && <><div className="flex gap-2"><Button variant={vote === 1 ? "default" : "outline"} size="icon" title="Like" aria-label="Like article" aria-pressed={vote === 1} disabled={busy} onClick={() => rate(1)}><ThumbsUp className="h-4 w-4" /></Button><Button variant={vote === -1 ? "default" : "outline"} size="icon" title="Dislike" aria-label="Dislike article" aria-pressed={vote === -1} disabled={busy} onClick={() => rate(-1)}><ThumbsDown className="h-4 w-4" /></Button></div><Textarea aria-label="Doctor comment" placeholder="Add a clinical comment" maxLength={4000} value={comment} onChange={(e) => setComment(e.target.value)} rows={3} /><Button size="sm" disabled={busy || !comment.trim()} onClick={async () => {
      if (!user) return; setBusy(true);
      try { const { error } = await supabase.from("knowledge_article_comments").insert({ article_id: articleId, user_id: user.id, body: comment.trim() }); if (error) throw error; setComment(""); setPage(0); await Promise.all([qc.invalidateQueries({ queryKey: ["knowledge-comments", articleId] }), qc.invalidateQueries({ queryKey: ["knowledge-stats"] })]); toast.success("Comment saved"); }
      catch (e) { toast.error(e instanceof Error ? e.message : "Comment could not be saved"); } finally { setBusy(false); }
    }}><Send className="h-4 w-4 mr-2" />Post comment</Button></>}
    {error && <p className="text-sm text-destructive">{error.message}</p>}
    {comments?.rows.map((c) => <div key={c.id} className="border-b pb-3"><div className="text-xs text-muted-foreground">{c.author_name} · {new Date(c.created_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}</div><p className="text-sm whitespace-pre-wrap break-words mt-1">{c.body}</p></div>)}
    {!!comments?.count && comments.count > 10 && <div className="flex gap-2"><Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous comments</Button><Button size="sm" variant="outline" disabled={(page + 1) * 10 >= comments.count} onClick={() => setPage(page + 1)}>More comments</Button></div>}
  </section>;
}