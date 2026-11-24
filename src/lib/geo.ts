/**
 * Where somebody was when they checked in.
 *
 * Both of these are BEST-EFFORT and neither ever throws. A denied permission,
 * a phone indoors that cannot see the sky, a geocoding service having a bad
 * day - none of them may cost somebody their attendance. The caller stamps
 * and stores whatever came back, including nothing.
 *
 * Ported from the Bharath Builders app, minus its Capacitor branch: that app
 * ships as a native build and tries a native plugin first, which in a web PWA
 * is a `require` that always throws. This is the browser path it falls back
 * to anyway.
 */

export interface Fix {
  latitude: number;
  longitude: number;
  accuracy: number | null;
}

/** Long enough for a cold GPS fix, short enough that nobody stands at the
 *  door wondering whether the button worked. */
const POSITION_TIMEOUT_MS = 10_000;

/** How stale a cached fix may be. Somebody checking out has not moved since
 *  they checked in, and a cold GPS lock is the slowest part of the flow. */
const POSITION_MAX_AGE_MS = 120_000;

/**
 * The rough fallback: Wi-Fi and mobile-network location, no GPS.
 *
 * Asking only for a high-accuracy fix meant that a phone indoors, which often
 * cannot get a GPS lock inside ten seconds, saved the attendance with no
 * location at all - the same person would get one at check-out and none at
 * check-in. A network fix is usually within a few dozen metres and arrives in
 * a second or two, which is plenty to show somebody was at the clinic.
 */
const ROUGH_TIMEOUT_MS = 15_000;
const ROUGH_MAX_AGE_MS = 10 * 60_000;

/** The address lookup is a nicety; the coordinates and the time are the
 *  record. Four seconds, then give up and stamp without it. */
const GEOCODE_TIMEOUT_MS = 4_000;

/** Position error code for "the user (or the browser) said no". */
const PERMISSION_DENIED = 1;

type Answer = { fix: Fix } | { denied: true } | null;

/** One request to the browser. Never rejects. */
function ask(options: PositionOptions & { timeout: number }): Promise<Answer> {
  return new Promise<Answer>((resolve) => {
    let settled = false;
    const done = (value: Answer) => { if (!settled) { settled = true; resolve(value); } };
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => done({
          fix: {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null,
          },
        }),
        (err) => done(err && err.code === PERMISSION_DENIED ? { denied: true } : null),
        options,
      );
    } catch {
      done(null);
    }
    // Belt and braces: some browsers never call either callback when the
    // permission prompt is dismissed rather than answered.
    setTimeout(() => done(null), options.timeout + 1_000);
  });
}

/**
 * The browser's position, or null. Never rejects.
 *
 * A precise (GPS) fix and a rough (network) fix are asked for at the same
 * time. The precise one wins when it arrives; when it times out or is
 * unavailable the rough one is used instead. A denied permission gets no
 * fallback - there is nothing a second request could do about it.
 */
export async function currentPosition(): Promise<Fix | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  // maximumAge was 0, so every call paid for a cold high-accuracy lock
  // - including check-out, minutes after a check-in from the same spot.
  // Two minutes is short enough that the fix is still where they are
  // standing and long enough to make the second lookup instant.
  const precise = ask({ enableHighAccuracy: true, timeout: POSITION_TIMEOUT_MS, maximumAge: POSITION_MAX_AGE_MS });
  const rough = ask({ enableHighAccuracy: false, timeout: ROUGH_TIMEOUT_MS, maximumAge: ROUGH_MAX_AGE_MS });

  const first = await precise;
  if (first && "fix" in first) return first.fix;
  if (first && "denied" in first) return null;

  const second = await rough;
  return second && "fix" in second ? second.fix : null;
}

/**
 * A street address for a fix, or null.
 *
 * OpenStreetMap's Nominatim: no key, no account. Its usage policy asks for
 * at most one request a second and that clients identify themselves; at two
 * check-ins a day for seventeen people this is a handful of calls, and a
 * browser sends its own Referer. If this ever moves to a bulk job it needs
 * batching and a real User-Agent.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
      { signal: controller.signal, headers: { Accept: "application/json" } },
    );
    // The reference skips this check, so a 429 body becomes "undefined".
    if (!res.ok) return null;
    const body = await res.json();
    const name = typeof body?.display_name === "string" ? body.display_name.trim() : "";
    return name || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "12.87145, 74.84321" - what the caption and the admin list fall back to
 *  when no address resolved. */
export function formatFix(fix: Fix | null | undefined): string {
  if (!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return "";
  return `${fix.latitude.toFixed(5)}, ${fix.longitude.toFixed(5)}`;
}

/** A link that opens the spot in Google Maps, or null when there is no fix. */
export function mapsLink(fix: Fix | null | undefined): string | null {
  if (!fix || !Number.isFinite(fix.latitude) || !Number.isFinite(fix.longitude)) return null;
  return `https://www.google.com/maps?q=${fix.latitude},${fix.longitude}`;
}
