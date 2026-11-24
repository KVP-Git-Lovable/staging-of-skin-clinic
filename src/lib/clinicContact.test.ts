import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  CLINIC_ADDRESS_LINES,
  CLINIC_EMAILS,
  CLINIC_EXPLORE_LINKS,
  CLINIC_PHONES,
  CLINIC_TEL,
  CLINIC_WHATSAPP,
} from "./clinicContact";

/**
 * The patient portal's landing page dialled 9380682287, a number that
 * appeared nowhere else in the app, while the clinic website page and both
 * bots gave patients 96201 23030. A patient reading one number and hearing
 * another is not something anybody reports as a bug; it just wastes a call.
 */
describe("the clinic's contact details", () => {
  it("dials and messages the number the bots already give out", () => {
    expect(CLINIC_TEL).toBe("tel:+919620123030");
    expect(CLINIC_WHATSAPP).toContain("919620123030");
  });

  it("agrees with what the WhatsApp bot tells patients", () => {
    // If the bot's number is ever changed, this fails rather than letting the
    // two drift apart again.
    const bot = readFileSync("supabase/functions/whatsapp-webhook/index.ts", "utf8");
    const digits = CLINIC_TEL.replace(/\D/g, "").slice(-10);
    expect(bot.replace(/\D/g, "")).toContain(digits);
  });

  it("writes every phone number as a dialable link", () => {
    for (const p of CLINIC_PHONES) {
      expect(p.tel, p.label).toMatch(/^tel:\+91\d{10}$/);
      // The label and the link must be the same number, not two numbers.
      expect(p.tel.replace(/\D/g, "")).toBe(p.label.replace(/\D/g, ""));
    }
  });

  it("has an address and real email addresses", () => {
    expect(CLINIC_ADDRESS_LINES.join(" ")).toContain("575003");
    for (const e of CLINIC_EMAILS) expect(e).toMatch(/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i);
  });

  it("retires the portal's old number completely", () => {
    const page = readFileSync("src/pages/portal/PortalLanding.tsx", "utf8");
    // The comment explaining the change may name it; no rendered text, tel:
    // link or wa.me URL may. Comments are stripped rather than matched
    // around, because a tel: link can be written +91-prefixed, bare, or
    // spaced, and a regex over the raw file misses at least one of those.
    const code = page
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "")
      .replace(/^\s*\*.*$/gm, "");
    expect(code, "the retired number is still rendered or linked").not.toContain("9380682287");
  });
});

/**
 * The Explore column points into the /clinic page in this app. Those are hash
 * anchors, and a hash that matches no section scrolls nowhere while looking
 * like a working link. Worse, `/portal/:tab` is a catch-all route, so a link
 * to a page that does not exist opens the patient dashboard instead of
 * failing visibly.
 */
describe("every Explore link goes somewhere real", () => {
  const landing = () => readFileSync("src/pages/clinic/Landing.tsx", "utf8");

  it("points only at sections that exist on the clinic page", () => {
    const page = landing();
    for (const link of CLINIC_EXPLORE_LINKS) {
      const [path, hash] = link.href.split("#");
      expect(path, `${link.label} should point at /clinic`).toBe("/clinic");
      expect(hash, `${link.label} has no anchor`).toBeTruthy();
      expect(page, `/clinic has no section with id="${hash}" for "${link.label}"`)
        .toMatch(new RegExp(`id=["']${hash}["']`));
    }
  });

  it("is routed - /clinic is a real route", () => {
    expect(readFileSync("src/App.tsx", "utf8")).toMatch(/path="\/clinic"/);
  });

  it("names nothing the app cannot show", () => {
    // The clinic's public website also has Skin AI, Blog and Careers pages.
    // None exist here, so they are deliberately absent rather than shipped
    // as links that quietly open the dashboard.
    const labels = CLINIC_EXPLORE_LINKS.map((l) => l.label.toLowerCase());
    for (const missing of ["skin ai", "blog", "careers"]) {
      expect(labels).not.toContain(missing);
    }
  });
});
