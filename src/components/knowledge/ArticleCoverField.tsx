import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImageIcon, Loader2, Sparkles, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { KNOWLEDGE_BUCKET } from "@/lib/knowledge";
import { coverErrorMessage, knowledgeCoverPrompt } from "@/lib/knowledgeCoverPrompt";
import { streamImage } from "@/lib/knowledgeImageStream";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { uploadKnowledgeFile } from "@/components/knowledge/ArticleResources";

/**
 * The picture on the article's card.
 *
 * The grid used to fall back to the article's first picture attachment -
 * which is a clinical diagram - and a bundled clinic photo was no better. The
 * clinic wanted one "which matches the content of article", so Generate makes
 * a picture from this article's own title, service, category and summary.
 *
 * ── Nothing is stored until Keep ──
 *
 * The generated picture is held in the browser as a data URL while it is
 * looked at. Only Keep uploads it, and only Save puts the path on the
 * article - the same bar every other AI suggestion in this app has to clear.
 *
 * The file goes into the same private bucket as every other knowledge
 * attachment, so the field holds a path and signs it to show the preview.
 */
export function ArticleCoverField({
  value, onChange, group, onBusyChange, subject,
}: {
  value: string | null;
  onChange: (path: string | null) => void;
  group: string;
  onBusyChange?: (busy: boolean) => void;
  /** What the picture should be of: this article, as it stands in the form. */
  subject: { id?: string; title: string; service: string; category: string; summary: string };
}) {
  const input = useRef<HTMLInputElement>(null);
  const abort = useRef<AbortController | null>(null);
  const [uploading, setUploading] = useState(false);
  const [drafting, setDrafting] = useState(false);
  /** The generated picture, in the browser only, until Keep. */
  const [frame, setFrame] = useState("");
  const [frameDone, setFrameDone] = useState(false);

  const { data: preview } = useQuery({
    queryKey: ["knowledge-cover", value],
    enabled: !!value,
    staleTime: 30 * 60 * 1000,
    queryFn: async () => {
      if (!value) return null;
      const { data, error } = await supabase.storage.from(KNOWLEDGE_BUCKET).createSignedUrl(value, 3600);
      if (error) throw error;
      return data.signedUrl;
    },
  });

  const busy = uploading || drafting;
  const setBusy = (next: boolean) => { onBusyChange?.(next); };

  const store = async (file: File) => {
    const resource = await uploadKnowledgeFile(file, group);
    if (!resource.path) throw new Error("The picture did not upload");
    onChange(resource.path);
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Choose a picture file"); return; }
    setUploading(true); setBusy(true);
    try {
      await store(file);
      toast.success("Cover picture set");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The picture could not be uploaded");
    } finally {
      setUploading(false); setBusy(false);
    }
  };

  const generate = async () => {
    // Null when there is no title yet: a picture made from nothing is the
    // irrelevant stock photo this replaced, and it would spend a credit.
    if (!knowledgeCoverPrompt(subject)) {
      toast.error("Give the article its title first, so the picture can match it");
      return;
    }
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { toast.error("Please sign in."); return; }

    abort.current = new AbortController();
    setDrafting(true); setBusy(true);
    setFrame(""); setFrameDone(false);
    try {
      await streamImage(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/knowledge-cover-image`,
        {
          article_id: subject.id ?? "",
          title: subject.title,
          service: subject.service,
          category: subject.category,
          summary: subject.summary,
        },
        (url, complete) => { setFrame(url); setFrameDone(complete); },
        abort.current.signal,
        {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      );
    } catch (e) {
      setFrame(""); setFrameDone(false);
      if (!(e instanceof Error && e.name === "AbortError")) {
        toast.error(coverErrorMessage(e));
      }
    } finally {
      setDrafting(false); setBusy(false);
    }
  };

  const keep = async () => {
    if (!frame || !frameDone) return;
    setUploading(true); setBusy(true);
    try {
      const blob = await (await fetch(frame)).blob();
      await store(new File([blob], "article-cover.png", { type: "image/png" }));
      setFrame(""); setFrameDone(false);
      toast.success("Cover picture set");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The picture could not be saved");
    } finally {
      setUploading(false); setBusy(false);
    }
  };

  const discard = () => { setFrame(""); setFrameDone(false); };

  return (
    <div className="space-y-1.5">
      <Label>Cover picture</Label>
      <div className="flex items-start gap-3">
        <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border bg-muted">
          {frame ? (
            <img src={frame} alt="Suggested cover" className="h-full w-full object-cover" />
          ) : preview ? (
            <img src={preview} alt="Cover preview" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full w-full place-items-center">
              <ImageIcon className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
        </div>
        <div className="min-w-0 space-y-1.5">
          {frame ? (
            // Held in the browser only. Nothing has been stored yet.
            <div className="flex flex-wrap items-center gap-2">
              {drafting ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => abort.current?.abort()}>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Stop
                </Button>
              ) : (
                <>
                  <Button type="button" size="sm" disabled={!frameDone || uploading} onClick={() => void keep()}>
                    {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}Keep
                  </Button>
                  <Button type="button" variant="ghost" size="sm" disabled={uploading} onClick={discard}>
                    Discard
                  </Button>
                </>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <input
                ref={input}
                type="file"
                accept="image/*"
                className="hidden"
                aria-label="Cover picture"
                onChange={(e) => { void choose(e.target.files?.[0]); e.target.value = ""; }}
              />
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void generate()}>
                {drafting ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
                Generate
              </Button>
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
                {uploading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1.5" />}
                {value ? "Replace" : "Upload"}
              </Button>
              {value && (
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => onChange(null)}>
                  <X className="h-3.5 w-3.5 mr-1.5" />Remove
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {frame
              ? "Nothing is saved until you press Keep."
              : "Shown on the article card. Generate makes one from this article's own title and treatment."}
          </p>
        </div>
      </div>
    </div>
  );
}
