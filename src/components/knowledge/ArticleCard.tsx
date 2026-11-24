import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, BookOpen, Clock, Copy, Pencil, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { KNOWLEDGE_BUCKET, targetLabel, type KnowledgeArticle } from "@/lib/knowledge";
import { bannerTint, coverPath, readingMinutes } from "@/lib/knowledgeBrowse";
import { hasPatientSummary } from "@/lib/patientSummary";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EngagementMeter } from "@/components/knowledge/ArticleEngagement";

/**
 * One article, as a card.
 *
 * The library used to be a run of text rows, which is the right shape for a
 * ledger and the wrong one for choosing what to read. The picture and the
 * title do the work; everything the old row carried - service, category,
 * who it is for, status, critical flag, patient summary, engagement - is
 * still here, arranged instead of listed.
 *
 * Motion is transform and opacity only, and stops entirely under
 * prefers-reduced-motion: this grid can be thirty cards on a clinic laptop.
 */

/**
 * The cover, signed.
 *
 * Knowledge imagery lives in a private bucket, so a card cannot simply point
 * an <img> at it. One signed URL per card, cached for half an hour - well
 * inside the hour the signature lasts.
 */
function useCoverUrl(path: string | null) {
  return useQuery({
    queryKey: ["knowledge-cover", path],
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!path) return null;
      const { data, error } = await supabase.storage.from(KNOWLEDGE_BUCKET).createSignedUrl(path, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });
}

export function ArticleCard({
  article, serviceName, categoryName, stats, canEdit, onOpen, onEdit, onClone, onDelete,
}: {
  article: KnowledgeArticle;
  serviceName?: string;
  categoryName?: string;
  stats?: Parameters<typeof EngagementMeter>[0]["stats"];
  canEdit: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
}) {
  const path = coverPath(article);
  const { data: cover } = useCoverUrl(path);
  const minutes = readingMinutes(article);

  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-within:ring-2 focus-within:ring-ring motion-reduce:transform-none motion-reduce:transition-none">
      <div className="relative h-28 shrink-0 overflow-hidden border-b sm:h-36">
        {cover ? (
          <img
            src={cover}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04] motion-reduce:transform-none motion-reduce:transition-none"
          />
        ) : (
          <div className={`grid h-full w-full place-items-center bg-gradient-to-br ${bannerTint(article.id)}`}>
            <BookOpen className="h-8 w-8 text-primary/50" />
          </div>
        )}
        <div className="absolute right-2 top-2">
          <Badge variant={article.status === "published" ? "default" : "secondary"} className="capitalize shadow-sm">
            {article.status}
          </Badge>
        </div>
        {article.is_critical && (
          <div className="absolute left-2 top-2">
            <Badge variant="destructive" className="gap-1 shadow-sm">
              <AlertTriangle className="h-3 w-3" />Critical
            </Badge>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-wrap gap-1.5">
          {serviceName && <Badge variant="secondary" className="whitespace-normal text-left">{serviceName}</Badge>}
          {categoryName && <Badge variant="outline" className="whitespace-normal text-left">{categoryName}</Badge>}
        </div>

        <h3 className="font-display text-base font-semibold leading-snug">
          {/* The whole title is the target, so the card is as easy to open on
              a phone as the old row was with a mouse. */}
          <button
            type="button"
            onClick={onOpen}
            className="text-left outline-none transition-colors hover:text-primary focus-visible:text-primary motion-reduce:transition-none"
          >
            {article.title}
          </button>
        </h3>

        {article.summary && (
          <p className="line-clamp-3 text-sm text-muted-foreground">{article.summary}</p>
        )}

        <div className="flex flex-wrap gap-1.5">
          {!article.is_active && <Badge variant="outline">Inactive</Badge>}
          {article.ai_generated && <Badge variant="outline">AI-assisted</Badge>}
          {hasPatientSummary(article) && (
            <Badge variant="outline" className="border-primary/40 text-primary">Patient summary</Badge>
          )}
        </div>

        <div className="mt-auto space-y-2 pt-2">
          <EngagementMeter stats={stats} />
          <div className="flex items-center justify-between gap-2 border-t pt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5" />{minutes} min read
            </span>
            <span className="flex min-w-0 items-center gap-1.5">
              <Users className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate capitalize">{targetLabel(article)}</span>
            </span>
          </div>
          {canEdit && (
            <div className="flex justify-end gap-0.5">
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" aria-label={`Edit ${article.title}`} onClick={onEdit}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Clone" aria-label={`Clone ${article.title}`} onClick={onClone}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" title="Delete" aria-label={`Delete ${article.title}`} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
