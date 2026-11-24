import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_FACTS, FACT_CARDS, editableFacts, factCards, hasPatientSummary, patientFacts,
  patientSummaryIsPublic, PATIENT_SUMMARY_DISCLAIMER, aiWriteLabel, WRITE_SUMMARY_CTA,
} from "./patientSummary";

/**
 * The patient's version of a knowledge article.
 *
 * Two things are worth proving here and they are not the same thing. One is
 * that nothing shown to a patient can throw: patient_facts is jsonb, and a
 * screen turned towards a patient mid-consult must degrade to a missing card,
 * never to a blank page. The other is the publication gate - a draft summary
 * must not reach a patient's eyes or a printer, which is the whole safety
 * argument for keeping this on the article row.
 */

const article = (over: Record<string, unknown> = {}) => ({
  status: "published", is_active: true, patient_summary: "Short and clear.", patient_facts: {}, ...over,
} as Parameters<typeof patientSummaryIsPublic>[0]);

describe("reading patient_facts back", () => {
  it("gives the empty shape for anything that is not an object", () => {
    for (const value of [null, undefined, "sessions", 7, true, ["sessions"]]) {
      expect(patientFacts(value)).toEqual(EMPTY_FACTS);
    }
  });

  it("keeps the good fields and drops the bad ones, rather than all or nothing", () => {
    // A whole-object parse would throw away "6 sessions" because of the
    // number beside it. Four good cards must survive one bad one.
    const facts = patientFacts({ sessions: "6 sessions", each_visit: 20, downtime: "None" });
    expect(facts.sessions).toBe("6 sessions");
    expect(facts.downtime).toBe("None");
    expect(facts.each_visit).toBeUndefined();
  });

  it("drops a card that is blank or far too long for one", () => {
    expect(patientFacts({ sessions: "   " }).sessions).toBeUndefined();
    expect(patientFacts({ sessions: "x".repeat(121) }).sessions).toBeUndefined();
    expect(patientFacts({ sessions: "x".repeat(120) }).sessions).toHaveLength(120);
  });

  it("keeps the usable points in a list and skips the rest", () => {
    const facts = patientFacts({ dos: ["Use sunscreen", "", "   ", 5, "Shave the day before"] });
    expect(facts.dos).toEqual(["Use sunscreen", "Shave the day before"]);
  });

  it("caps a list rather than refusing it", () => {
    const facts = patientFacts({ donts: Array.from({ length: 12 }, (_, i) => `point ${i}`) });
    expect(facts.donts).toHaveLength(8);
  });

  it("leaves a list out entirely when nothing in it survives", () => {
    expect(patientFacts({ dos: ["", "  ", 3] }).dos).toBeUndefined();
  });

  it("keeps only timeline steps that have both a when and a what", () => {
    const facts = patientFacts({ timeline: [
      { when: "Before", what: "Shave the area" },
      { when: "On the day" },
      { what: "Use moisturiser" },
      { when: "After", what: "Avoid the sun" },
    ] });
    expect(facts.timeline).toEqual([
      { when: "Before", what: "Shave the area" },
      { when: "After", what: "Avoid the sun" },
    ]);
  });

  it("ignores keys nobody asked for", () => {
    // The database guard rejects these on the way in; this is the second half
    // of the same rule, for rows written before it existed.
    expect(patientFacts({ dosage: "20mg", sessions: "6" })).toEqual({ sessions: "6" });
  });
});

describe("which cards get drawn", () => {
  it("returns only the ones filled in, in a fixed order", () => {
    const cards = factCards(patientFacts({ downtime: "A day", sessions: "6 sessions" }));
    // Declaration order, not the order the object happened to be written in:
    // the cards must not reshuffle between two articles.
    expect(cards.map((c) => c.key)).toEqual(["sessions", "downtime"]);
    expect(cards[0].label).toBe("Sessions");
  });

  it("returns nothing at all for empty facts", () => {
    expect(factCards(EMPTY_FACTS)).toEqual([]);
  });

  it("covers every card key it knows about", () => {
    const all = Object.fromEntries(FACT_CARDS.map(([key]) => [key, "filled"]));
    expect(factCards(patientFacts(all))).toHaveLength(FACT_CARDS.length);
  });
});

describe("is there anything to show", () => {
  it("counts text on its own", () => {
    expect(hasPatientSummary({ patient_summary: "Something", patient_facts: {} })).toBe(true);
  });

  it("counts facts on their own, including lists and the timeline", () => {
    expect(hasPatientSummary({ patient_summary: "", patient_facts: { sessions: "6" } })).toBe(true);
    expect(hasPatientSummary({ patient_summary: "", patient_facts: { dos: ["Use sunscreen"] } })).toBe(true);
    expect(hasPatientSummary({ patient_summary: "", patient_facts: { donts: ["No waxing"] } })).toBe(true);
    expect(hasPatientSummary({ patient_summary: "", patient_facts: { timeline: [{ when: "After", what: "Rest" }] } })).toBe(true);
  });

  it("is false for an article nobody has written one for", () => {
    expect(hasPatientSummary({ patient_summary: "   ", patient_facts: {} })).toBe(false);
    expect(hasPatientSummary({ patient_summary: "", patient_facts: { dosage: "20mg" } })).toBe(false);
  });
});

describe("the publication gate", () => {
  it("lets a published, active, written-up article through", () => {
    expect(patientSummaryIsPublic(article())).toBe(true);
  });

  it("refuses a draft, however complete", () => {
    expect(patientSummaryIsPublic(article({ status: "draft" }))).toBe(false);
  });

  it("refuses an article marked reviewed but not yet published", () => {
    // "Reviewed" is a doctor's bookmark, not approval for a patient to read it.
    expect(patientSummaryIsPublic(article({ status: "reviewed" }))).toBe(false);
  });

  it("refuses a published article that has been deactivated", () => {
    expect(patientSummaryIsPublic(article({ is_active: false }))).toBe(false);
  });

  it("refuses a published article with nothing written for the patient", () => {
    expect(patientSummaryIsPublic(article({ patient_summary: "", patient_facts: {} }))).toBe(false);
  });
});

describe("the two buttons", () => {
  it("offers to rewrite only when there is something to replace", () => {
    expect(aiWriteLabel(false)).toBe("Write with AI");
    expect(aiWriteLabel(true)).toBe("Rewrite with AI");
  });

  it("never gives the entry point and the AI button the same name", () => {
    // Exactly the reported confusion. Both were "Write patient summary", so
    // pressing one produced the other and the feature looked broken.
    expect(WRITE_SUMMARY_CTA).not.toBe(aiWriteLabel(false));
    expect(WRITE_SUMMARY_CTA).not.toBe(aiWriteLabel(true));
  });

  it("names each button in one place, so they cannot drift back together", () => {
    const read = (path: string) =>
      readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
    const page = read("src/pages/KnowledgeArticleDetail.tsx");
    expect(page).toContain("WRITE_SUMMARY_CTA");
    const section = read("src/components/knowledge/PatientSummaryEditor.tsx");
    expect(section).toContain("aiWriteLabel(written)");
    // Neither hard-codes the other's words.
    expect(section).not.toContain(WRITE_SUMMARY_CTA);
    expect(page).not.toContain(aiWriteLabel(false));
  });
});

describe("the disclaimer", () => {
  it("says it is not personal advice, in words a patient would use", () => {
    expect(PATIENT_SUMMARY_DISCLAIMER).toMatch(/not personal medical advice/i);
    expect(PATIENT_SUMMARY_DISCLAIMER).toMatch(/doctor/i);
  });
});

describe("where the gate is applied", () => {
  /**
   * Source with its comments removed, so a commented-out line cannot satisfy
   * a guard here.
   *
   * Only comments that START a line, unlike the usual house helper: this reads
   * edge-function source, where `https://ai.gateway.lovable.dev` contains a
   * `//` and the usual regex truncates the rest of that line - which is the
   * very line carrying `webSearch: false`.
   */
  const read = (path: string) =>
    readFileSync(path, "utf8").replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("the consultation panel asks before offering the patient view", () => {
    // This panel already queries published articles only. It asks anyway: a
    // future change to that query must not quietly open the patient view.
    const src = read("src/components/knowledge/ClinicalGuidelines.tsx");
    expect(src).toContain("patientSummaryIsPublic(a)");
  });

  it("the article page gates the tab and the handout separately", () => {
    const src = read("src/pages/KnowledgeArticleDetail.tsx");
    // An editor sees the tab whether or not anything is written in it - that
    // empty tab is the only visible way in. Everybody ELSE stays gated, and
    // that is the half that must never loosen.
    expect(src).toMatch(/showPatient = !!article && \(canEdit \|\| patientSummaryIsPublic\(article\)\)/);
    expect(src).not.toMatch(/canEdit \? hasPatientSummary\(article\)/);
    // The print button asks the published question for itself, not "is the
    // tab visible" - an editor looking at a draft must not be able to print it.
    expect(src).toMatch(/canPrintHandout = !!article && patientSummaryIsPublic\(article\)/);
  });

  it("one click writes it, rather than opening a second identical button", () => {
    // The reported bug: pressing "Write patient summary" opened an editor whose
    // patient section had a button of the same name, so it read as a button
    // that did nothing but show itself.
    const page = read("src/pages/KnowledgeArticleDetail.tsx");
    expect(page).toContain('setEditorStart("patient-summary")');
    const editor = read("src/components/knowledge/ArticleEditor.tsx");
    expect(editor).toContain('autoStart={start === "patient-summary"}');
    const section = read("src/components/knowledge/PatientSummaryEditor.tsx");
    // Latched by a ref, not by an effect's dependencies: this component
    // re-renders on every keystroke and each call costs credits.
    expect(section).toContain("started.current = true");
    expect(section).toMatch(/if \(!autoStart \|\| started\.current \|\| written\) return;/);
  });

  it("shows the patient section alone, not the clinical article beside it", () => {
    // Writing the patient's version used to happen in the full editor, with the
    // clinical summary and protocol on screen - two articles at once, and the
    // wrong one in front of the person.
    const editor = read("src/components/knowledge/ArticleEditor.tsx");
    expect(editor).toContain('useState(start === "patient-summary")');
    expect(editor).toContain("{!patientOnly && <>");
    expect(editor).toContain("{!patientOnly && !proposal && <ResourceEditor");
    expect(editor).toContain("{!patientOnly && !proposal && <KnowledgePicture");
    // and nothing is lost - the rest is one click away
    expect(editor).toContain("Show the full article");
    expect(editor).toContain("setPatientOnly(false)");
  });

  it("keeps the clinical AI's Stop button to the clinical AI", () => {
    // One shared busy flag meant a patient-summary run greyed out "AI Enrich &
    // Review" and put a Stop beside it, which aborted a controller that was not
    // running. The flags are separate: busy blocks saving, drafting is this
    // editor's own run.
    const editor = read("src/components/knowledge/ArticleEditor.tsx");
    expect(editor).toMatch(/\{drafting && <Button variant="ghost" onClick=\{\(\) => abort\.current\?\.abort\(\)\}/);
    expect(editor).not.toMatch(/\{busy && <Button variant="ghost" onClick=\{\(\) => abort\.current\?\.abort\(\)\}/);
    // saving still waits for anything at all to finish
    expect(editor).toContain("disabled={save.isPending || busy || !!proposal}");
  });

  it("says out loud that it is working", () => {
    const section = read("src/components/knowledge/PatientSummaryEditor.tsx");
    expect(section).toContain('data-testid="patient-summary-working"');
    expect(section).toContain("Writing the patient summary");
  });

  it("the empty tab offers the way to write one", () => {
    const src = read("src/pages/KnowledgeArticleDetail.tsx");
    expect(src).toContain("No patient summary yet");
    expect(src).toContain('data-testid="write-patient-summary"');
    // and it lands on the section rather than the top of a long sheet
    expect(src).toContain('setEditorStart("patient-summary")');
    const editor = read("src/components/knowledge/ArticleEditor.tsx");
    expect(editor).toMatch(/export const PATIENT_SUMMARY_SECTION_ID/);
    expect(editor).toContain("scrollIntoView");
    // The anchor has to be ON the section, not merely named in the scroller.
    expect(read("src/components/knowledge/PatientSummaryEditor.tsx"))
      .toContain("id={PATIENT_SUMMARY_SECTION_ID}");
  });

  it("the list shows which articles already have one", () => {
    // The library is a grid of cards now, so the mark lives on the card the
    // list renders rather than in the page itself.
    const src = read("src/components/knowledge/ArticleCard.tsx");
    expect(src).toContain("hasPatientSummary(article)");
    expect(src).toContain("Patient summary");
    expect(read("src/pages/KnowledgeArticles.tsx")).toContain("<ArticleCard");
  });

  it("the patient summary AI never searches the web", () => {
    // It rewrites doctor-approved text. A web result reaching it would be an
    // unreviewed clinical claim in the one version written for a patient.
    const src = read("supabase/functions/knowledge-ai/index.ts");
    expect(src).toContain("webSearch: false");
    const responses = read("supabase/functions/knowledge-ai/responses.ts");
    expect(responses).toMatch(/webSearch \? \{ tools:/);
  });
});

describe("editableFacts - what the editor draws while a doctor types", () => {
  it("keeps a blank point so Add shows a new row", () => {
    expect(editableFacts({ dos: ["Use sunscreen", ""] }).dos).toEqual(["Use sunscreen", ""]);
  });
  it("keeps a blank timeline step so Add step shows a new row", () => {
    expect(editableFacts({ timeline: [{ when: "", what: "" }] }).timeline).toEqual([{ when: "", what: "" }]);
  });
  it("keeps a trailing space so a second word can be typed", () => {
    expect(editableFacts({ sessions: "3 " }).sessions).toBe("3 ");
    expect(editableFacts({ donts: ["Avoid "] }).donts).toEqual(["Avoid "]);
  });
  it("still saves trimmed with blanks dropped", () => {
    expect(patientFacts({ sessions: "3 to 6 ", dos: ["Use sunscreen ", ""], timeline: [{ when: "", what: "" }] }))
      .toEqual({ sessions: "3 to 6", dos: ["Use sunscreen"] });
  });
  it("ignores non-string junk", () => {
    expect(editableFacts({ sessions: 4, dos: [1, "ok"], timeline: [null, { when: 2 }] }))
      .toEqual({ dos: ["ok"], timeline: [{ when: "", what: "" }] });
  });
});
