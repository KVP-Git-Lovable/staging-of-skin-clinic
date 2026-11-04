/**
 * What an attachment is, so it can be shown rather than only named.
 *
 * The attachments tab listed every file behind the same grey icon, so finding
 * the right consent form among five photographs of consent forms meant opening
 * each one. The files themselves are mostly photographs, and they can be shown
 * as such - but only once something decides which ones are images.
 *
 * The rule reads both the file name and the URL, because either may be the one
 * carrying the extension: a name typed by a phone camera has it, a name typed
 * by a person may not, and a URL may carry a query string after it.
 */

export type AttachmentKind = "image" | "pdf" | "file";

const IMAGE = /\.(jpe?g|png|gif|webp|bmp|heic|heif|svg)(\?|#|$)/i;
const PDF = /\.pdf(\?|#|$)/i;

/** Image, PDF, or something to be downloaded rather than previewed. */
export function attachmentKind(
  fileName: string | null | undefined,
  fileUrl: string | null | undefined,
): AttachmentKind {
  const name = (fileName ?? "").trim();
  const url = (fileUrl ?? "").trim();
  // The name is the better evidence - a URL can end in a storage id - so it
  // answers first, and the URL is the fallback for a name without a suffix.
  if (IMAGE.test(name) || IMAGE.test(url)) return "image";
  if (PDF.test(name) || PDF.test(url)) return "pdf";
  return "file";
}
