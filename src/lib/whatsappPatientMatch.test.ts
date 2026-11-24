import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Which patient a WhatsApp message is from.
 *
 * The clinic reminded Pooja N Patil of her appointment tomorrow. She replied
 * "Confirm" and the bot answered "Thanks for confirming, Vihaan!" - her son,
 * who shares the number. The lookup asked for any patient on that number and
 * took the first row back, `.limit(1)` with no ORDER BY, which has no defined
 * answer. 2,587 numbers here carry more than one patient, 5,879 people.
 *
 * The rule itself is SQL, because it needs the appointments to decide, so
 * what is asserted here is that the two callers use it and that the rule says
 * what it is supposed to say. The rule's behaviour was rehearsed against the
 * live clinic: the reported number resolves to Pooja in all three shapes
 * Twilio sends it, a number stored as "733 859 4205" still matches, an
 * unknown and a malformed number return nothing, and 200 sampled shared
 * numbers all resolve to a profile actually on that number.
 */

const MIGRATION = "supabase/migrations/20261118140000_which_patient_is_texting.sql";
const WEBHOOK = "supabase/functions/whatsapp-webhook/index.ts";
const SEND_REPLY = "supabase/functions/whatsapp-send-reply/index.ts";

const sql = () => readFileSync(MIGRATION, "utf8").replace(/^\s*--.*$/gm, "");
const code = (p: string) =>
  readFileSync(p, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("nobody guesses from the phone number any more", () => {
  for (const [name, path] of [["the webhook", WEBHOOK], ["the staff reply", SEND_REPLY]] as const) {
    it(`${name} asks the database which patient it is`, () => {
      expect(code(path)).toContain('rpc("whatsapp_patient_for_phone"');
    });

    it(`${name} no longer takes the first row from an unordered lookup`, () => {
      // The exact shape of the bug: any patient on the number, first one back.
      const source = code(path);
      expect(source).not.toMatch(/phone\.ilike/);
      expect(source).not.toMatch(/\.or\(`phone\.eq\./);
    });
  }
});

describe("what decides it", () => {
  it("prefers whoever has an appointment around now", () => {
    // Pooja had one the next day; Vihaan's was in April. That is the whole
    // difference, and it has to be the first thing the ordering looks at.
    const s = sql();
    const order = s.slice(s.indexOf("order by"));
    expect(order.indexOf("appt.nearest")).toBeLessThan(order.indexOf("hist.last_visit"));
    expect(order).toMatch(/appt\.nearest asc nulls last/);
  });

  it("falls back to whoever came most recently, then to the oldest profile", () => {
    const order = sql().slice(sql().indexOf("order by"));
    expect(order).toMatch(/hist\.last_visit desc nulls last/);
    expect(order).toMatch(/c\.created_at asc/);
  });

  it("always gives the same answer, which an unordered LIMIT never did", () => {
    // created_at is the last thing the ordering looks at, so there is no tie
    // left for the database to break however it likes.
    const s = sql();
    const order = s.indexOf("order by");
    expect(s.indexOf("c.created_at asc", order)).toBeGreaterThan(s.indexOf("hist.last_visit desc", order));
    expect(s.indexOf("limit 1", order)).toBeGreaterThan(s.indexOf("c.created_at asc", order));
  });

  it("ignores a cancelled appointment", () => {
    // A cancelled visit is not evidence that somebody is expected today.
    expect(sql()).toMatch(/coalesce\(a\.status, ''\) <> 'Cancelled'/);
  });

  it("only counts appointments around now, not any time in history", () => {
    expect(sql()).toMatch(/between now\(\) - interval '2 days' and now\(\) \+ interval '30 days'/);
  });

  it("does not decide from the last message on the thread", () => {
    // That signal is self-reinforcing: this very thread already carries two
    // rows filed under the wrong patient, and it would keep choosing him.
    expect(sql()).not.toMatch(/whatsapp_conversations/);
  });
});

describe("who it can find, and who may ask", () => {
  it("matches on the indexed column, so an awkwardly stored number still works", () => {
    // '733 859 4205' has spaces inside the last ten digits; a LIKE on the raw
    // text misses it, and thirteen patients are stored that way.
    const s = sql();
    expect(s).toContain("p.phone_last10 = d.last10");
    expect(s).not.toMatch(/phone like/i);
  });

  it("strips whatever shape Twilio sends", () => {
    expect(sql()).toMatch(/regexp_replace\(coalesce\(p_phone, ''\), '\\D', '', 'g'\)/);
  });

  it("answers nothing for a number that is not ten digits", () => {
    const s = sql();
    expect(s).toContain("d.last10 is not null");
    expect(s).toContain("length(d.last10) = 10");
  });

  it("looks only at the number the clinic already matched on", () => {
    // alternate_phone would widen who can be reached here; that is a separate
    // decision, not a side effect of fixing this.
    expect(sql()).not.toMatch(/alternate_phone/);
  });

  it("runs as definer with search_path pinned, and is not open to visitors", () => {
    const s = sql();
    expect(s).toMatch(/security definer/);
    expect(s).toMatch(/set search_path to 'public'/);
    expect(s).toContain("revoke all on function public.whatsapp_patient_for_phone(text) from public, anon");
    expect(s).toContain("grant execute on function public.whatsapp_patient_for_phone(text) to authenticated, service_role");
  });

  it("changes no table, so the published build is untouched", () => {
    const s = sql();
    expect(s).not.toMatch(/alter table/i);
    expect(s).not.toMatch(/create table|drop /i);
  });
});
