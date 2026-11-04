import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { clinicalFields, safeImageSrc, sectionStartsCollapsed, splitResources, type KnowledgeArticle } from "@/lib/knowledge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArticleResources } from "./ArticleResources";

type ArticleShape = Pick<
  KnowledgeArticle,
  "summary" | "clinical_protocol" | "contraindications" | "pre_post_care" | "complications_management" | "sources"
> & { resources?: unknown };

/**
 * How the markdown in a clinical section is rendered.
 *
 * `skipHtml` stays: raw HTML in the body is dropped, which is what keeps
 * anything scripted out of a doctor-authored field.
 *
 * Images used to be thrown away here outright (`img: () => null`), so a
 * diagram placed beside the step it explains silently vanished. They render
 * now, guarded by safeImageSrc - http(s) only.
 */
const markdownComponents = {
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) => {
    const safe = safeImageSrc(src);
    if (!safe) return null;
    return (
      <img
        src={safe}
        alt={alt || ""}
        loading="lazy"
        className="max-h-96 max-w-full rounded-md border object-contain"
      />
    );
  },
};

/**
 * One clinical section, folded when it is long.
 *
 * Folded by clamping the rendered HEIGHT, never by cutting the string. A
 * markdown body cut at a character count breaks lists, links and emphasis
 * mid-structure; a max-height cannot, because the markdown is always parsed
 * whole and only the view of it is short.
 */
function Section({ label, body, collapsible }: { label: string; body: string; collapsible: boolean }) {
  const foldable = collapsible && sectionStartsCollapsed(body);
  const [open, setOpen] = useState(false);
  const folded = foldable && !open;

  return (
    <section className="space-y-2">
      <h3 className="font-semibold">{label}</h3>
      <div className="relative">
        <div
          className={cn(
            "prose prose-sm dark:prose-invert max-w-none text-foreground",
            folded && "max-h-48 overflow-hidden",
          )}
        >
          <ReactMarkdown skipHtml components={markdownComponents}>{body}</ReactMarkdown>
        </div>
        {/* Fades the cut edge so it reads as "there is more" rather than as a
            section that happens to end mid-sentence. */}
        {folded && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
      {foldable && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 -ml-2 text-xs text-primary"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <><ChevronUp className="h-3.5 w-3.5 mr-1" />Show less</> : <><ChevronDown className="h-3.5 w-3.5 mr-1" />Read more</>}
        </Button>
      )}
    </section>
  );
}

/**
 * @param collapsible Fold long sections behind "Read more". OFF by default,
 *   deliberately: this component also renders the editor's proposed-vs-current
 *   diff and the revision snapshots in history, where a clinician is checking
 *   wording and must see all of it. Only the article page asks for folding.
 */
export function ArticleContent({ article, collapsible = false }: { article: ArticleShape; collapsible?: boolean }) {
  const { pictures, others } = splitResources(article.resources);

  return (
    <div className="space-y-5 text-sm break-words">
      {article.summary && <p className="text-muted-foreground whitespace-pre-wrap leading-relaxed">{article.summary}</p>}

      {/* Pictures sit with the content. They used to be at the very bottom,
          below the references, under "Attachments & further reading" - past
          12,000 characters of prose, where nobody looked. */}
      {pictures.length > 0 && <ArticleResources value={pictures} heading={null} />}

      {clinicalFields.map(([key, label]) =>
        article[key] ? <Section key={key} label={label} body={article[key]} collapsible={collapsible} /> : null,
      )}

      {/* Files, links, videos and related articles genuinely are further
          reading, so they stay at the end. */}
      <ArticleResources value={others} />
    </div>
  );
}
