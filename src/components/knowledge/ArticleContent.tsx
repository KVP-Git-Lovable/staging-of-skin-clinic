import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { CITATION_LINK_LABEL, citationHost, clinicalFields, compactSourceCitations, safeImageSrc, sectionStartsCollapsed, splitResources, type KnowledgeArticle } from "@/lib/knowledge";
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
/** The link text of an anchor, when it is a single plain string. */
function linkLabel(children: React.ReactNode): string | null {
  if (typeof children === "string") return children;
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === "string") return children[0];
  return null;
}

const markdownComponents = {
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => {
    // A citation compactSourceCitations collapsed: draw the icon, not the
    // hostname. The name still reaches a screen reader through aria-label,
    // and a mouse gets it in the tooltip - the text is relocated, not lost.
    if (linkLabel(children) === CITATION_LINK_LABEL) {
      const host = citationHost(href);
      return (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          title={host ? `Source: ${host}` : "Source"}
          aria-label={host ? `Source: ${host}` : "Source"}
          className="inline-flex translate-y-px items-center text-muted-foreground no-underline hover:text-accent-foreground"
        >
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      );
    }
    return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>;
  },
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
  // Measured on the TRANSFORMED text, not the stored body. SECTION_FOLD_CHARS
  // is documented as a proxy for height, and collapsing ~70 characters of
  // citation per bullet changes the height a lot - folding on the raw length
  // would put a "Read more" on sections that now fit.
  const text = useMemo(() => compactSourceCitations(body), [body]);
  const foldable = collapsible && sectionStartsCollapsed(text);
  const [open, setOpen] = useState(false);
  const folded = foldable && !open;

  return (
    <section className="space-y-2">
      {/* 15px/700, not the inherited 14px/600. tailwind.config.ts caps every
          heading inside a body at 14px and ranks them by weight, topping out
          at h1's 800 - so the label has to clear them on size. 15px and not
          16px because in the in-appointment panel this sits INSIDE a
          <details> whose <summary> carries the article's own title at
          text-sm (ClinicalGuidelines.tsx:47); 16px would make a section
          heading louder than the title of the article it belongs to. */}
      <h3 className="text-[0.9375rem] font-bold">{label}</h3>
      <div className="relative">
        <div
          className={cn(
            // No dark:prose-invert. tailwind.config.ts binds every prose
            // colour to a semantic token and src/index.css already
            // redefines those under `.dark`, so inverting here would
            // overwrite them with the plugin's own grays and break it.
            "prose prose-sm max-w-none text-foreground",
            folded && "max-h-48 overflow-hidden",
          )}
        >
          <ReactMarkdown skipHtml components={markdownComponents}>{text}</ReactMarkdown>
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
