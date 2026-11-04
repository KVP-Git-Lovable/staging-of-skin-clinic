/**
 * What to tell staff after a batch upload.
 *
 * Kept in one place because the wording is the whole point of it: "2 failed"
 * on its own leaves someone re-uploading all seven files to work out which two
 * are missing, so every failure is named with its reason. Photos and
 * attachments both report this way, and a second copy of the text would drift -
 * which is exactly how the printed prescription stayed wrong after the screen
 * had been fixed.
 */

export interface FailedUpload {
  /** Position in the batch. Two files really can both be called "WhatsApp Image.jpeg". */
  index: number;
  name: string;
  reason: string;
}

/** e.g. "5 photos uploaded" / "Photo uploaded". Null when nothing succeeded. */
export const uploadSuccessMessage = (uploaded: number, singular: string, plural: string): string | null => {
  if (uploaded <= 0) return null;
  return uploaded === 1 ? `${singular} uploaded` : `${uploaded} ${plural} uploaded`;
};

/** e.g. "2 of 7 could not be uploaded — a.jpg: too large; b.jpg: network". Null when all succeeded. */
export const uploadFailureMessage = (failed: FailedUpload[], total: number): string | null => {
  if (failed.length === 0) return null;
  return (
    `${failed.length} of ${total} could not be uploaded — ` +
    failed.map((f) => `${f.name}: ${f.reason}`).join("; ")
  );
};
