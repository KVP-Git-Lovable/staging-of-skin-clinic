import { supabase } from "@/integrations/supabase/client";

/**
 * Media for Meta ads (single image or video).
 *
 * Files are uploaded to the public `social-media` bucket; Meta fetches images by
 * URL (`link_data.picture`) and videos by URL (`advideos.file_url`). Videos are
 * additionally registered in the ad account's video library (`video_id`) and
 * must finish processing on Meta before the ad can be published.
 */

export const IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const VIDEO_MAX_BYTES = 20 * 1024 * 1024;

export const IMAGE_MIME = ["image/jpeg", "image/png", "image/gif", "image/webp"];
export const VIDEO_MIME = ["video/mp4", "video/quicktime", "video/webm"];
export const MEDIA_ACCEPT = [...IMAGE_MIME, ...VIDEO_MIME].join(",");

export const AD_MEDIA_BUCKET = "social-media";

export type AdMediaKind = "image" | "video";
export type VideoStatus = "processing" | "ready" | "error";

export type AdMedia = {
  kind: AdMediaKind;
  url: string;
  storage_path?: string;
  size?: number;
  mime?: string;
  /** Video only — Meta ad-account video library id and its processing state. */
  video_id?: string;
  video_status?: VideoStatus;
  thumbnail_url?: string;
  thumbnail_path?: string;
};

/** Ads Manager's link-ad buttons. The first four were the only ones offered before. */
export const META_CALL_TO_ACTIONS: Array<[string, string]> = [
  ["LEARN_MORE", "Learn More"],
  ["SHOP_NOW", "Shop Now"],
  ["SIGN_UP", "Sign Up"],
  ["CONTACT_US", "Contact Us"],
  ["GET_OFFER", "Get Offer"],
  ["BOOK_NOW", "Book Now"],
  ["GET_QUOTE", "Get Quote"],
  ["SUBSCRIBE", "Subscribe"],
  ["ORDER_NOW", "Order Now"],
  ["APPLY_NOW", "Apply Now"],
  ["DOWNLOAD", "Download"],
  ["WATCH_MORE", "Watch More"],
  ["NO_BUTTON", "No button"],
];

/** Reads the stored `media` JSON; legacy rows hold `{ url }` and are treated as images. */
export function normalizeMedia(value: unknown): AdMedia | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  const url = typeof v.url === "string" ? v.url.trim() : "";
  if (!url) return null;
  const kind: AdMediaKind = v.kind === "video" ? "video" : "image";
  const media: AdMedia = { kind, url };
  if (typeof v.storage_path === "string") media.storage_path = v.storage_path;
  if (typeof v.size === "number") media.size = v.size;
  if (typeof v.mime === "string") media.mime = v.mime;
  if (kind === "video") {
    if (typeof v.video_id === "string" && v.video_id) media.video_id = v.video_id;
    if (v.video_status === "ready" || v.video_status === "processing" || v.video_status === "error") {
      media.video_status = v.video_status;
    }
    if (typeof v.thumbnail_url === "string" && v.thumbnail_url) media.thumbnail_url = v.thumbnail_url;
    if (typeof v.thumbnail_path === "string") media.thumbnail_path = v.thumbnail_path;
  }
  return media;
}

export function mediaKindForFile(file: File): AdMediaKind | null {
  if (IMAGE_MIME.includes(file.type)) return "image";
  if (VIDEO_MIME.includes(file.type)) return "video";
  // Some browsers report an empty type for .mov files.
  if (/\.(mp4|mov|webm)$/i.test(file.name)) return "video";
  if (/\.(jpe?g|png|gif|webp)$/i.test(file.name)) return "image";
  return null;
}

/** Returns an error message when the file is not acceptable, otherwise null. */
export function validateMediaFile(file: File): string | null {
  const kind = mediaKindForFile(file);
  if (!kind) return "Unsupported file. Use JPG, PNG, GIF or WebP images, or MP4, MOV or WebM videos.";
  if (kind === "image" && file.size > IMAGE_MAX_BYTES) return "Image must be under 8 MB.";
  if (kind === "video" && file.size > VIDEO_MAX_BYTES) return "Video must be under 20 MB.";
  return null;
}

function extensionFor(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm",
  };
  return map[file.type] || "bin";
}

async function uploadToBucket(path: string, body: Blob, contentType: string): Promise<string> {
  const { error } = await supabase.storage
    .from(AD_MEDIA_BUCKET)
    .upload(path, body, { contentType, cacheControl: "3600", upsert: false });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data } = supabase.storage.from(AD_MEDIA_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Uploads an image or video from the user's device and returns its public URL. */
export async function uploadAdMedia(file: File): Promise<AdMedia> {
  const problem = validateMediaFile(file);
  if (problem) throw new Error(problem);
  const kind = mediaKindForFile(file)!;
  const id = crypto.randomUUID();
  const path = `ads/${id}.${extensionFor(file)}`;
  const url = await uploadToBucket(path, file, file.type || (kind === "video" ? "video/mp4" : "image/jpeg"));
  return { kind, url, storage_path: path, size: file.size, mime: file.type || undefined };
}

/**
 * Grabs a frame from the video (≈1 s in) as a JPEG. Meta needs a thumbnail for
 * video ads, and capturing it here avoids waiting for Meta's own generation.
 */
export function captureVideoThumbnail(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    const objectUrl = URL.createObjectURL(file);
    const cleanup = () => URL.revokeObjectURL(objectUrl);
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;
    video.onerror = () => { cleanup(); reject(new Error("Could not read the video to capture a thumbnail")); };
    video.onloadedmetadata = () => {
      const target = Math.min(1, Math.max(0, (video.duration || 1) / 2));
      try { video.currentTime = target; } catch { /* some browsers throw before data loads */ }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas not available");
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          cleanup();
          if (blob) resolve(blob); else reject(new Error("Could not capture a thumbnail"));
        }, "image/jpeg", 0.86);
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    };
  });
}

/** Uploads a captured thumbnail next to its video and returns { url, path }. */
export async function uploadVideoThumbnail(videoPath: string, blob: Blob): Promise<{ url: string; path: string }> {
  const path = videoPath.replace(/\.[a-z0-9]+$/i, "") + "-thumb.jpg";
  const url = await uploadToBucket(path, blob, "image/jpeg");
  return { url, path };
}

export function describeMedia(media: AdMedia | null | undefined): string {
  if (!media) return "No media";
  if (media.kind === "video") {
    const status = media.video_status === "ready" ? "ready" : media.video_status === "error" ? "failed on Meta" : media.video_id ? "processing on Meta" : "not registered on Meta";
    return `Video · ${status}`;
  }
  return media.storage_path ? "Image · uploaded" : "Image · by URL";
}
