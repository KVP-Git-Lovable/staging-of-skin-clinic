/**
 * The patient's profile picture, and what to show when there isn't one.
 */

/**
 * The letters in the circle.
 *
 * The header rendered `first_name[0]` and `last_name[0]` straight out of the
 * record. Thousands of patients here have no surname at all, which gave one
 * letter - right - and a patient with no first name gave an EMPTY circle,
 * which reads as a page that failed to load rather than as a record missing a
 * name.
 */
export function patientInitials(first?: string | null, last?: string | null): string {
  const a = String(first ?? "").trim();
  const b = String(last ?? "").trim();
  const letters = `${a.charAt(0)}${b.charAt(0)}`.trim();
  // "?" rather than nothing: a circle with something in it is a record, an
  // empty one looks broken.
  return letters ? letters.toUpperCase() : "?";
}

/** Extensions worth keeping off an uploaded portrait. */
const KNOWN = new Set(["jpg", "jpeg", "png", "webp", "heic", "heif"]);

/**
 * Where an uploaded portrait is stored.
 *
 * Inside the patient's own folder, which is how every other photo in this
 * bucket is laid out - so a patient's files stay together and the storage rules
 * that already cover the bucket cover this too.
 *
 * Timestamped rather than a fixed "avatar.jpg": overwriting one name would be
 * served from cache long after it changed, and the clinic would swear the new
 * photo had not saved.
 */
export function avatarStoragePath(
  patientId: string,
  fileName?: string | null,
  now: number = Date.now(),
): string {
  const name = String(fileName ?? "");
  const dot = name.lastIndexOf(".");
  const raw = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  const ext = KNOWN.has(raw) ? raw : "jpg";
  // A random suffix as well as the clock: two portraits taken in the same
  // millisecond would otherwise collide on the same path.
  const unique = Math.random().toString(36).slice(2, 8);
  return `${patientId}/avatar-${now}-${unique}.${ext}`;
}
