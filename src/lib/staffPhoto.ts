import { supabase } from "@/integrations/supabase/client";
import { shrinkOrOriginal } from "@/lib/stampPhoto";
import { ATTENDANCE_PHOTO_MAX_EDGE } from "@/lib/attendance";

/**
 * Saving the photo a staff member's attendance selfie is checked against.
 *
 * Lives here rather than in a component because two screens now need it: the
 * profile page, where somebody sets it deliberately, and the attendance page,
 * where somebody who has not set one registers their face and carries
 * straight on into starting their day. Two copies of an upload that writes to
 * storage AND a column is two chances for them to drift apart.
 */

/** A year: this URL is read by the face verifier on every single check-in,
 *  so a short expiry would mean re-signing it constantly. */
const SIGNED_FOR = 60 * 60 * 24 * 365;

const KNOWN_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

/** `<staffId>/profile-<timestamp>.<ext>` — the first segment is the staff id
 *  because the bucket policy only lets somebody write inside their own
 *  folder, so the path IS the permission. Timestamped rather than a fixed
 *  name: one overwritten path is served from cache long after it changed, and
 *  the person would swear the new photo had not saved. */
export function staffPhotoPath(staffId: string, fileName?: string | null, now: number = Date.now()): string {
  const raw = String(fileName ?? "").split(".").pop()?.toLowerCase() ?? "";
  const ext = KNOWN_EXT.has(raw) ? raw : "jpg";
  return `${staffId}/profile-${now}.${ext}`;
}

/**
 * Uploads the photo, points staff.photo_url at it, and hands back the URL.
 *
 * Throws on failure - both callers show the message, and a silent failure
 * here would leave somebody unable to check in with no idea why.
 */
export async function uploadStaffPhoto(staffId: string, file: File): Promise<string> {
  // The baseline was stored at whatever the source happened to be. Picked
  // from the gallery on a phone that is a 12MP, 3-5MB frame - uploaded on
  // clinic data, kept forever, and re-read by the face verifier on every
  // check-in. 800px is more than the matcher uses.
  //
  // Never fails the registration: shrinkOrOriginal hands back the original
  // on any error, so the worst case is the behaviour we had before.
  const body = await shrinkOrOriginal(file, ATTENDANCE_PHOTO_MAX_EDGE);

  // The extension follows what is actually being stored, not the name the
  // phone gave us: shrinkOrOriginal re-encodes to JPEG when it resizes and
  // returns the untouched original when it does not, so a picked .png can
  // leave here as either. A path saying .png over JPEG bytes is the kind of
  // mismatch that serves broken images months later.
  const type = body.type || file.type || "image/jpeg";
  const path = staffPhotoPath(staffId, type === "image/jpeg" ? "x.jpg" : file.name);

  const { error: upErr } = await supabase.storage
    .from("attendance-photos")
    .upload(path, body, { contentType: type });
  if (upErr) throw upErr;

  const { data: signed, error: signErr } = await supabase.storage
    .from("attendance-photos")
    .createSignedUrl(path, SIGNED_FOR);
  if (signErr || !signed?.signedUrl) throw signErr || new Error("Could not prepare the photo");

  const { error: saveErr } = await supabase
    .from("staff")
    .update({ photo_url: signed.signedUrl })
    .eq("id", staffId);
  if (saveErr) throw saveErr;

  return signed.signedUrl;
}
