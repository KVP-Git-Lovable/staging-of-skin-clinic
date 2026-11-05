/**
 * What a patient is worth to the clinic, as a band.
 *
 * The badge on the patient card used to be a restatement of the engagement
 * score - score >= 80 Platinum, >= 60 Gold, >= 40 Silver, else Early - and
 * that score is only a quarter revenue, the rest being visit frequency,
 * treatment depth, retention and show rate. It showed: the Silver band ran
 * from Rs 0 to Rs 3.84 lakh, Platinum started at Rs 17,700, and a patient who
 * had spent five lakh but visited rarely could read "Early".
 *
 * The clinic asked for bands on lifetime billing instead. The score and its
 * five breakdown bars are unchanged - only the badge stops echoing them, so a
 * patient can now legitimately read "Engagement 32/100 - Platinum".
 *
 * THIS RULE EXISTS IN THREE PLACES and they must agree:
 *   1. here, for the browser and the tests;
 *   2. supabase/functions/patient-engagement/index.ts, because Deno cannot
 *      import the browser bundle;
 *   3. public.recalc_patient_invoice_rollups, because the database is the
 *      authority - it is the only writer that runs for every patient rather
 *      than only the ones somebody has opened.
 * patientTier.test.ts reads the other two and fails if the numbers drift.
 */

/** The two rupee boundaries, exactly as the clinic stated them. */
export const TIER_BANDS = {
  /** Rs 1,00,000 and above is Gold. */
  gold: 100_000,
  /** ABOVE Rs 3,00,000 is Platinum - three lakh exactly is still Gold. */
  platinum: 300_000,
} as const;

export type PatientTier = "Early" | "Silver" | "Gold" | "Platinum";

/** The badge for each band. Unchanged from the score-based version, so every
 *  saved view, filter option and colour map keeps working. */
const EMOJI: Record<PatientTier, string> = {
  Platinum: "🏆",
  Gold: "🥇",
  Silver: "🥈",
  Early: "🌱",
};

/**
 * The band for a patient's NET lifetime billing.
 *
 * Net means cancelled and merged invoices do not count - the same rule the
 * rest of the app uses to decide whether a visit was billed at all. A tier
 * earned on money that was never collected is worse than no tier.
 *
 * "Early" is kept for a patient who has been billed nothing whatsoever.
 * Without it, 7,831 records who have never paid a rupee would wear the same
 * badge as somebody who has spent Rs 99,750.
 *
 * A negative total - possible only from a refund or a correction - is treated
 * as nothing billed rather than being allowed to read as a band.
 */
export function patientTier(netBilled: number | string | null | undefined): PatientTier {
  const n = typeof netBilled === "string" ? Number(netBilled) : netBilled;
  if (n == null || Number.isNaN(n) || n <= 0) return "Early";
  if (n > TIER_BANDS.platinum) return "Platinum";
  if (n >= TIER_BANDS.gold) return "Gold";
  return "Silver";
}

/** The badge for a tier name, falling back to Early for anything unrecognised. */
export function tierEmoji(tier: string | null | undefined): string {
  return EMOJI[(tier ?? "") as PatientTier] ?? EMOJI.Early;
}

/** Every tier, richest first - the order the filter dropdown already uses. */
export const PATIENT_TIERS: readonly PatientTier[] = ["Platinum", "Gold", "Silver", "Early"] as const;
