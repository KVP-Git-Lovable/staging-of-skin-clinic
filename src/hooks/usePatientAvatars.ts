import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Photo selection rule (highest score wins, newest photo breaks ties):
 *  +3  explicit front-facing / portrait hints
 *  +1  a "before" clinical shot (usually the full, unobstructed face)
 *  -3  close-ups, side/back angles or region shots — poor for recognition
 */
const FRONT_HINTS = ["front", "face", "portrait", "straight", "headshot", "full face"];
const POOR_HINTS = ["close", "closeup", "close-up", "macro", "side", "left", "right", "back", "scalp", "lesion", "area", "zoom", "under", "chin"];

function score(photo: any): number {
  const hay = `${photo.photo_type ?? ""} ${photo.notes ?? ""}`.toLowerCase();
  let s = 0;
  if (FRONT_HINTS.some((h) => hay.includes(h))) s += 3;
  if (hay.includes("before")) s += 1;
  if (POOR_HINTS.some((h) => hay.includes(h))) s -= 3;
  return s;
}

/**
 * Best recognisable photo per patient, keyed by patient id.
 * Deterministic: best score first, then the most recent photo, then the lowest id.
 */
export function usePatientAvatars(patientIds: string[]) {
  const ids = [...new Set(patientIds.filter(Boolean))].sort();
  const key = ids.join(",");

  const { data } = useQuery({
    queryKey: ["patient-avatars", key],
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const map: Record<string, string> = {};
      const best: Record<string, { score: number; taken: number; id: string }> = {};
      // chunk to keep the URL length sane
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100);
        const { data, error } = await supabase
          .from("patient_photos")
          .select("id, patient_id, photo_url, photo_type, notes, taken_at")
          .in("patient_id", chunk)
          .order("taken_at", { ascending: false });
        if (error) throw error;
        for (const p of data || []) {
          if (!p.photo_url) continue;
          const candidate = {
            score: score(p),
            taken: p.taken_at ? new Date(p.taken_at).getTime() : 0,
            id: String(p.id),
          };
          const current = best[p.patient_id];
          const better =
            !current ||
            candidate.score > current.score ||
            (candidate.score === current.score && candidate.taken > current.taken) ||
            (candidate.score === current.score && candidate.taken === current.taken && candidate.id < current.id);
          if (better) {
            best[p.patient_id] = candidate;
            map[p.patient_id] = p.photo_url;
          }
        }
      }
      return map;
    },
  });

  return data ?? {};
}
