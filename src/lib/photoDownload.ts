/**
 * What a downloaded clinical photo should be called.
 *
 * The storage path gives names like "1793167500224-0-mord0r.jpg". Save four of
 * those to compare a patient across visits and the folder is unusable - which
 * is half the reason the viewer only ever offered "open in a new tab" and left
 * the saving to whoever clicked it.
 *
 * So the name is rebuilt from what the viewer already knows: who it is, what
 * was done, and when.
 */

export interface PhotoNameParts {
  patientName?: string | null;
  /** The photo's taken_at, ISO. */
  takenAt?: string | null;
  serviceName?: string | null;
  /** The storage URL, read only for its file extension. */
  url?: string | null;
}

/** Extensions worth trusting from a URL. Anything else gets the default. */
const KNOWN = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif", "gif", "bmp", "tif", "tiff"]);

/**
 * The file extension, from the PATH and never the query string.
 *
 * A signed storage URL ends "…mord0r.jpg?token=eyJ…", and reading the
 * extension off the whole string would save a file called
 * "Asha Rao.jpg?token=eyJ….jpg".
 */
function extensionOf(url: string | null | undefined): string {
  const raw = String(url ?? "");
  if (!raw) return "jpg";
  // Cut the query and the fragment before looking for a dot.
  const path = raw.split(/[?#]/)[0];
  const last = path.slice(path.lastIndexOf("/") + 1);
  const dot = last.lastIndexOf(".");
  if (dot <= 0) return "jpg";
  const ext = last.slice(dot + 1).toLowerCase();
  return KNOWN.has(ext) ? ext : "jpg";
}

/** dd-MM-yyyy. Hyphens, because a slash would start a new folder. */
function dateOf(takenAt: string | null | undefined): string {
  const value = String(takenAt ?? "").trim();
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}-${d.getFullYear()}`;
}

/**
 * Strip what a filesystem will not take.
 *
 * Windows refuses \ / : * ? " < > | outright, and several patient names in the
 * clinic's own data carry a trailing space ("Shaida ", "Ayesha ") which some
 * systems quietly drop and others refuse.
 */
function clean(part: string): string {
  return part
    .replace(/[\\/:*?"<>|]+/g, " ")
    // Control characters would be legal in places and unreadable everywhere.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function photoFileName(parts: PhotoNameParts): string {
  const pieces = [parts.patientName, parts.serviceName, dateOf(parts.takenAt)]
    .map((p) => clean(String(p ?? "")))
    .filter(Boolean);

  // "photo" rather than a bare extension, for a photo with nothing known about
  // it - a file called ".jpg" is hidden on macOS and Linux.
  const base = pieces.join(" - ") || "photo";
  return `${base}.${extensionOf(parts.url)}`;
}
