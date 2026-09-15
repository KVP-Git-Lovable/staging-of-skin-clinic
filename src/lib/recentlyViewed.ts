const MAX = 50;

const keyFor = (object: string) => `lv.recentlyViewed.${object}`;

/** Ordered list of most-recently opened/edited record ids (newest first). */
export function getRecentlyViewed(object: string): string[] {
  try {
    const raw = localStorage.getItem(keyFor(object));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

export function markRecentlyViewed(object: string, id: string) {
  if (!id) return;
  try {
    const next = [id, ...getRecentlyViewed(object).filter((v) => v !== id)].slice(0, MAX);
    localStorage.setItem(keyFor(object), JSON.stringify(next));
  } catch {
    /* storage unavailable — recency is best-effort */
  }
}
