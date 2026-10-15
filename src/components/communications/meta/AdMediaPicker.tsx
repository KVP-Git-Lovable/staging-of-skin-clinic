import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Upload, X, RefreshCw, CheckCircle2, AlertTriangle, ImageIcon } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { readMetaApiError } from "@/lib/metaErrors";
import {
  MEDIA_ACCEPT,
  captureVideoThumbnail,
  type AdMedia,
  uploadAdMedia,
  uploadVideoThumbnail,
  validateMediaFile,
} from "@/lib/adMedia";

interface Props {
  value: AdMedia | null;
  onChange: (media: AdMedia | null) => void;
  /** Ad set the ad belongs to; used to pick the ad account for video registration. */
  adSetId: string;
  /** Name used as the video title on Meta. */
  title: string;
}

const POLL_MS = 5000;
const POLL_MAX = 36; // ~3 minutes

/**
 * "Add media": upload an image or video from the device, or paste an image URL
 * (the pre-existing option). Videos are registered in the Meta video library and
 * polled until Meta finishes processing them.
 */
export function AdMediaPicker({ value, onChange, adSetId, title }: Props) {
  const [tab, setTab] = useState<"upload" | "url">(value && !value.storage_path && value.kind === "image" ? "url" : "upload");
  const [busy, setBusy] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef(0);

  const registerVideo = async (media: AdMedia): Promise<AdMedia> => {
    if (!adSetId) {
      toast({ title: "Select an Ad Set first", description: "The video is registered under that ad set's ad account.", variant: "destructive" });
      return media;
    }
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "register_ad_video", payload: { ad_set_id: adSetId, file_url: media.url, title } },
    });
    if (error || data?.error) {
      toast({ title: "Meta could not accept the video", description: await readMetaApiError(error, data), variant: "destructive" });
      return { ...media, video_status: "error" };
    }
    return { ...media, video_id: String(data.video_id), video_status: (data.video_status as AdMedia["video_status"]) || "processing" };
  };

  const checkVideo = async (media: AdMedia): Promise<AdMedia> => {
    if (!media.video_id) return media;
    const { data, error } = await supabase.functions.invoke("meta-api", {
      body: { action: "check_ad_video", payload: { video_id: media.video_id } },
    });
    if (error || data?.error) return media;
    const next: AdMedia = { ...media, video_status: (data.video_status as AdMedia["video_status"]) || media.video_status };
    if (!next.thumbnail_url && data.thumbnail_url) next.thumbnail_url = String(data.thumbnail_url);
    return next;
  };

  // Poll Meta while a video is processing.
  useEffect(() => {
    if (!value || value.kind !== "video" || !value.video_id || value.video_status !== "processing") return;
    let cancelled = false;
    pollRef.current = 0;
    const tick = async () => {
      if (cancelled) return;
      pollRef.current += 1;
      const next = await checkVideo(value);
      if (cancelled) return;
      if (next.video_status !== value.video_status || next.thumbnail_url !== value.thumbnail_url) {
        onChange(next);
        return; // effect re-runs with the new value
      }
      if (pollRef.current < POLL_MAX) timer = window.setTimeout(tick, POLL_MS);
    };
    let timer = window.setTimeout(tick, POLL_MS);
    return () => { cancelled = true; window.clearTimeout(timer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.video_id, value?.video_status]);

  const handleFile = async (file: File) => {
    const problem = validateMediaFile(file);
    if (problem) { toast({ title: "File not accepted", description: problem, variant: "destructive" }); return; }
    try {
      setBusy("Uploading…");
      let media = await uploadAdMedia(file);
      if (media.kind === "video") {
        setBusy("Capturing thumbnail…");
        try {
          const thumb = await captureVideoThumbnail(file);
          const uploaded = await uploadVideoThumbnail(media.storage_path!, thumb);
          media = { ...media, thumbnail_url: uploaded.url, thumbnail_path: uploaded.path };
        } catch (e) {
          // Meta's own thumbnail is used as a fallback once processing finishes.
          console.warn("thumbnail capture failed", e);
        }
        setBusy("Registering video on Meta…");
        media = await registerVideo(media);
      }
      onChange(media);
      toast({ title: media.kind === "video" ? "Video uploaded" : "Image uploaded", description: media.kind === "video" ? "Meta is processing it. Publishing is possible once it shows Ready." : undefined });
    } catch (e) {
      toast({ title: "Upload failed", description: e instanceof Error ? e.message : String(e), variant: "destructive" });
    } finally {
      setBusy("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const manualCheck = async () => {
    if (!value) return;
    setChecking(true);
    const next = await checkVideo(value);
    setChecking(false);
    onChange(next);
  };

  const retryRegister = async () => {
    if (!value) return;
    setBusy("Registering video on Meta…");
    const next = await registerVideo({ ...value, video_id: undefined, video_status: undefined });
    setBusy("");
    onChange(next);
  };

  const statusBadge = () => {
    if (!value || value.kind !== "video") return null;
    if (value.video_status === "ready") return <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600"><CheckCircle2 className="h-3 w-3" /> Ready on Meta</Badge>;
    if (value.video_status === "error" || !value.video_id) return <Badge variant="destructive" className="gap-1"><AlertTriangle className="h-3 w-3" /> Not registered on Meta</Badge>;
    return <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Processing on Meta…</Badge>;
  };

  return (
    <div className="space-y-3 rounded-md border bg-muted/30 p-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as "upload" | "url")}>
        <TabsList className="grid h-8 w-full grid-cols-2">
          <TabsTrigger value="upload" className="text-xs">Upload from PC</TabsTrigger>
          <TabsTrigger value="url" className="text-xs">Paste image URL</TabsTrigger>
        </TabsList>
        <TabsContent value="upload" className="mt-2 space-y-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={MEDIA_ACCEPT}
            className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
          />
          <Button type="button" variant="outline" size="sm" className="w-full" disabled={!!busy} onClick={() => fileInputRef.current?.click()}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {busy || (value?.storage_path ? "Replace file" : "Choose image (≤ 8 MB) or video (≤ 20 MB)")}
          </Button>
          <p className="text-[11px] text-muted-foreground">JPG, PNG, GIF, WebP · MP4, MOV, WebM. Videos are sent to Meta's video library and need a minute to process.</p>
        </TabsContent>
        <TabsContent value="url" className="mt-2 space-y-2">
          <Input
            type="url"
            placeholder="https://example.com/image.jpg"
            className="text-base"
            value={value && value.kind === "image" && !value.storage_path ? value.url : ""}
            onChange={(e) => onChange(e.target.value.trim() ? { kind: "image", url: e.target.value.trim() } : null)}
          />
          <p className="text-[11px] text-muted-foreground">Public image link. Meta downloads it when the ad is published.</p>
        </TabsContent>
      </Tabs>

      {value && (
        <div className="flex items-start gap-3">
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded border bg-background">
            {value.kind === "video" ? (
              <video src={value.url} poster={value.thumbnail_url} controls className="h-full w-full object-cover" />
            ) : (
              <img src={value.url} alt="Ad media preview" className="h-full w-full object-cover" loading="lazy" />
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant="outline" className="gap-1">{value.kind === "video" ? "Video" : <><ImageIcon className="h-3 w-3" /> Image</>}</Badge>
              {statusBadge()}
              {value.size ? <span className="text-muted-foreground">{(value.size / (1024 * 1024)).toFixed(1)} MB</span> : null}
            </div>
            <p className="break-all text-[11px] text-muted-foreground">{value.url}</p>
            <div className="flex flex-wrap gap-2 pt-1">
              {value.kind === "video" && value.video_id && value.video_status !== "ready" && (
                <Button type="button" size="sm" variant="ghost" onClick={manualCheck} disabled={checking}>
                  {checking ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />} Check status
                </Button>
              )}
              {value.kind === "video" && (!value.video_id || value.video_status === "error") && (
                <Button type="button" size="sm" variant="ghost" onClick={retryRegister} disabled={!!busy}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Register on Meta again
                </Button>
              )}
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={() => onChange(null)} disabled={!!busy}>
                <X className="mr-1 h-3 w-3" /> Remove
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
