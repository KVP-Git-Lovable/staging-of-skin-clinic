/**
 * Uploading a handful of photos at once.
 *
 * On a phone each upload takes a few seconds, and the camera used to close
 * after every shot - so photographing four areas meant opening the camera,
 * shooting, waiting, and starting again four times, with the patient sitting
 * there. The shots are now collected first and sent together.
 */

/**
 * Where a photo is stored.
 *
 * The name was `${patientId}/${Date.now()}.${ext}`, which is unique enough for
 * one photo and not for five: a loop can start two uploads inside the same
 * millisecond, and the second would overwrite the first in storage - the row
 * would exist, the picture would be the wrong one. The position in the batch
 * and a short random suffix make that impossible, and the timestamp stays so
 * the folder still sorts by when it was taken.
 */
export function photoFileName(
  patientId: string,
  originalName: string,
  index: number,
  now: number = Date.now(),
  random: string = Math.random().toString(36).slice(2, 8),
): string {
  // Only after a dot. "photo" with no extension at all was being stored as
  // "...photo", because split(".").pop() hands back the whole name.
  const afterDot = originalName.includes(".") ? originalName.split(".").pop() ?? "" : "";
  const ext = afterDot.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) || "jpg";
  return `${patientId}/${now}-${index}-${random}.${ext}`;
}

export interface PhotoBatchOutcome {
  uploaded: number;
  failed: number;
}

/**
 * What to tell the clinic afterwards.
 *
 * A batch that half worked is the case worth getting right: saying "Photos
 * uploaded" over two silent failures loses pictures nobody will think to take
 * again, and saying "Upload failed" over three that went in sends them back to
 * photograph what is already there.
 */
export function photoBatchMessage({ uploaded, failed }: PhotoBatchOutcome): string {
  if (failed === 0) {
    return uploaded === 1 ? "Photo uploaded" : `${uploaded} photos uploaded`;
  }
  if (uploaded === 0) {
    return failed === 1 ? "The photo could not be uploaded" : `None of the ${failed} photos could be uploaded`;
  }
  return `${uploaded} uploaded, ${failed} could not be — the ${failed === 1 ? "one that failed is" : "ones that failed are"} still here to try again`;
}
