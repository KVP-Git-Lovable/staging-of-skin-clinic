import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PATIENT_TIERS, TIER_BANDS, patientTier, tierEmoji } from "./patientTier";

/**
 * The clinic asked for: below ₹1 lakh Silver, ₹1–3 L Gold, above ₹3 L
 * Platinum. The badge used to be a restatement of the engagement score, which
 * is only a quarter revenue - so Silver ran from ₹0 to ₹3.84 lakh and Platinum
 * began at ₹17,700.
 */
describe("patientTier", () => {
  it("bands the figures the clinic named", () => {
    expect(patientTier(50_000)).toBe("Silver");
    expect(patientTier(150_000)).toBe("Gold");
    expect(patientTier(500_000)).toBe("Platinum");
  });

  it("puts the boundaries exactly where they were asked for", () => {
    // "1-3 L gold" is inclusive at both ends; "3 L above" is strictly above.
    expect(patientTier(99_999)).toBe("Silver");
    expect(patientTier(99_999.99)).toBe("Silver");
    expect(patientTier(100_000)).toBe("Gold");
    expect(patientTier(300_000)).toBe("Gold");
    expect(patientTier(300_000.01)).toBe("Platinum");
    expect(patientTier(300_001)).toBe("Platinum");
  });

  it("keeps Early for a patient who has been billed nothing", () => {
    // 7,831 patients. Without this they would wear the same badge as somebody
    // who has spent ₹99,750.
    expect(patientTier(0)).toBe("Early");
    expect(patientTier(null)).toBe("Early");
    expect(patientTier(undefined)).toBe("Early");
  });

  it("refuses to band a negative total", () => {
    // A refund or a correction can take a patient below zero. That is not a
    // tier, it is nothing billed.
    expect(patientTier(-1)).toBe("Early");
    expect(patientTier(-500_000)).toBe("Early");
  });

  it("reads a numeric string, the way the database returns numeric", () => {
    expect(patientTier("150000")).toBe("Gold");
    expect(patientTier("0")).toBe("Early");
    expect(patientTier("not a number")).toBe("Early");
  });

  it("keeps the four names and badges the rest of the app already knows", () => {
    // ENGAGEMENT_TIER_OPTIONS, three colour maps, every saved view and every
    // campaign segment key off these exact strings.
    expect([...PATIENT_TIERS]).toEqual(["Platinum", "Gold", "Silver", "Early"]);
    expect(tierEmoji("Platinum")).toBe("🏆");
    expect(tierEmoji("Gold")).toBe("🥇");
    expect(tierEmoji("Silver")).toBe("🥈");
    expect(tierEmoji("Early")).toBe("🌱");
    expect(tierEmoji("nonsense")).toBe("🌱");
  });

  it("stays in step with the patient list's filter options", () => {
    const fields = readFileSync("src/lib/patientFields.ts", "utf8");
    for (const tier of PATIENT_TIERS) expect(fields).toContain(`"${tier}"`);
  });
});

/**
 * The rule lives in three places and they must agree, or a patient's badge
 * says one thing on the card and another in a saved view:
 *
 *   1. patientTier.ts            - the browser and these tests
 *   2. the patient-engagement edge function - Deno cannot import the bundle
 *   3. recalc_patient_invoice_rollups       - the database, the authority
 *
 * Reading the other two as text is the only check available: the edge
 * function runs on Deno and the function body lives in Postgres.
 */
describe("the three copies of the band agree", () => {
  const numbers = (text: string): string[] =>
    (text.replace(/_/g, "").match(/\b(100000|300000)\b/g) ?? []);

  it("the edge function uses the same two boundaries, the same way round", () => {
    const fn = readFileSync("supabase/functions/patient-engagement/index.ts", "utf8");
    expect(numbers(fn), "patient-engagement no longer mentions both boundaries").toEqual(
      expect.arrayContaining([String(TIER_BANDS.gold), String(TIER_BANDS.platinum)]),
    );
    // Strictly above three lakh for Platinum, at or above one lakh for Gold.
    expect(fn).toMatch(/totalBilled\s*>\s*300000.*Platinum/s);
    expect(fn).toMatch(/totalBilled\s*>=\s*100000.*Gold/s);
    expect(fn).toMatch(/totalBilled\s*>\s*0.*Silver/s);
    // And it must NOT still be banding on the score.
    expect(fn, "the tier is still derived from engagementScore").not.toMatch(
      /engagementScore\s*>=\s*80.*Platinum/s,
    );
  });

  it("the migration uses the same two boundaries, the same way round", () => {
    const sql = readFileSync(
      "supabase/migrations/20261104170000_a_patient_category_that_means_money.sql",
      "utf8",
    );
    expect(numbers(sql)).toEqual(
      expect.arrayContaining([String(TIER_BANDS.gold), String(TIER_BANDS.platinum)]),
    );
    expect(sql).toMatch(/when net > 300000 then 'Platinum'/);
    expect(sql).toMatch(/when net >= 100000 then 'Gold'/);
    expect(sql).toMatch(/when net > 0 then 'Silver'/);
    expect(sql).toMatch(/else 'Early'/);
  });

  it("all three exclude cancelled and merged invoices", () => {
    const fn = readFileSync("supabase/functions/patient-engagement/index.ts", "utf8");
    const sql = readFileSync(
      "supabase/migrations/20261104170000_a_patient_category_that_means_money.sql",
      "utf8",
    );
    expect(fn).toMatch(/\["Cancelled",\s*"Merged"\]/);
    expect(sql).toMatch(/not in \('Cancelled', 'Merged'\)/);
  });
});

/**
 * The tier is now a derived fact, so no screen may write it.
 *
 * The patients Kanban groups by any picklist and writes the column name onto
 * the card it is given. engagement_tier is a picklist, so before this a drag
 * silently overwrote a patient's category with whatever column it landed in,
 * contradicting their actual billing until something recomputed it.
 */
describe("no screen can set the category by hand", () => {
  it("lists engagement_tier as derived", async () => {
    const { DERIVED_PATIENT_FIELDS } = await import("./patientFields");
    expect(DERIVED_PATIENT_FIELDS).toContain("engagement_tier");
    // The other three the database also maintains from invoices and visits.
    expect(DERIVED_PATIENT_FIELDS).toContain("lifetime_value");
    expect(DERIVED_PATIENT_FIELDS).toContain("total_visits");
  });

  it("the Kanban refuses the move before writing", () => {
    const page = readFileSync("src/pages/Patients.tsx", "utf8");
    const move = page.slice(page.indexOf("const moveKanbanCard"));
    const guard = move.indexOf("DERIVED_PATIENT_FIELDS");
    const write = move.indexOf('from("patients").update');
    expect(guard, "moveKanbanCard does not check DERIVED_PATIENT_FIELDS").toBeGreaterThan(-1);
    expect(guard, "the guard must come BEFORE the update, not after").toBeLessThan(write);
  });
});

/**
 * The badge must not trust the edge function's own `tier`.
 *
 * 20261104170000 banded the category on billing and backfilled every patient.
 * Within the hour a patient showing ₹91,448 was wearing Platinum again: the
 * corrected function had been pushed to the repository but never deployed, so
 * the previous version was still recomputing the tier from the engagement
 * score (82 >= 80) and writing it back. Both badges therefore band the billed
 * figure themselves, which cannot drift from the database the way a
 * deployment can.
 */
describe("the badges band the billed figure themselves", () => {
  const card = () => readFileSync("src/components/patients/EngagementScoreCard.tsx", "utf8");
  const badge = () => readFileSync("src/components/patients/EngagementBadge.tsx", "utf8");

  it("the patient card bands totalBilled and ignores data.tier", () => {
    expect(card()).toMatch(/patientTier\(data\.stats\.totalBilled\)/);
    expect(card(), "the card still renders the function's tier").not.toMatch(/\{data\.tier\}/);
    expect(card(), "the card still renders the function's emoji").not.toMatch(/\{data\.tierEmoji\}/);
  });

  it("the list badge bands totalBilled and ignores data.tier", () => {
    expect(badge()).toMatch(/patientTier\(data\.stats\?\.totalBilled\)/);
    expect(badge(), "the badge still renders the function's tier").not.toMatch(/\{data\.tier\}/);
    expect(badge(), "the badge still renders the function's emoji").not.toMatch(/\{data\.tierEmoji\}/);
  });

  it("the card withholds the category when it withholds the amount", () => {
    // Four coarse buckets still disclose roughly what a colleague's patient
    // has spent, and the amount beside it is already behind a lock.
    const text = card();
    const atBadge = text.indexOf("patientTier(data.stats.totalBilled)");
    const guard = text.lastIndexOf("hideBilled ?", atBadge);
    expect(guard, "the tier badge is not behind the hideBilled guard").toBeGreaterThan(-1);
  });
});

/**
 * The database is the backstop. force_patient_tier overrides whatever a
 * client sends, so the stale edge function's write cannot stick.
 */
describe("the database forces the category", () => {
  it("the migration overrides the caller rather than trusting it", () => {
    const sql = readFileSync(
      "supabase/migrations/20261104190000_the_category_cannot_be_written_wrong.sql",
      "utf8",
    );
    expect(sql).toMatch(/new\.engagement_tier\s*:=/);
    expect(sql).toMatch(/before insert or update on public\.patients/);
    // The whole point: the caller's value is never read. A `coalesce(
    // new.engagement_tier, ...)` would let the stale edge function's
    // "Platinum" straight back in, and reads as a forcing trigger at a
    // glance. engagement_tier may appear ONCE, as the assignment target.
    const mentions = (sql.match(/new\.engagement_tier/g) ?? []).length;
    expect(mentions, "the trigger reads back the value it is supposed to override").toBe(1);
    // Same bands as everywhere else.
    expect(sql).toMatch(/new\.lifetime_value > 300000 then 'Platinum'/);
    expect(sql).toMatch(/new\.lifetime_value >= 100000 then 'Gold'/);
    expect(sql).toMatch(/new\.lifetime_value > 0 then 'Silver'/);
  });
});
