import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COVER_RULES,
  DATA_NOT_INSTRUCTIONS,
  MAX_SUMMARY_CHARS,
  MAX_TITLE_CHARS,
  coverName,
  coverSummary,
  coverTitle,
  coverErrorMessage,
  knowledgeCoverPrompt,
} from "@/lib/knowledgeCoverPrompt";

/**
 * The cover picture on a knowledge article's card.
 *
 * The grid first fell back to the article's own first picture attachment -
 * a clinical diagram - and a bundled clinic photo was no better. The clinic
 * asked for a picture "which matches the content of article - not just random
 * candle lit treatment room and all - which is irrelevant". Both halves are
 * requirements: realistic, AND about this article.
 */

const FN = "supabase/functions/knowledge-cover-image/index.ts";
const FIELD = "src/components/knowledge/ArticleCoverField.tsx";

const read = (p: string) => readFileSync(p, "utf8");
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const article = {
  title: "EXCIMER — All ages — All genders",
  service: "Excimer Laser",
  category: "Clinical Protocols & Technique Guidelines",
  summary: "Targeted 308-nm excimer laser treatment for localized vitiligo.",
};

describe("the prompt is about THIS article", () => {
  it("leads with the article's own title", () => {
    const prompt = knowledgeCoverPrompt(article)!;
    expect(prompt).toContain('titled: "EXCIMER — All ages — All genders"');
  });

  it("names the treatment and where it is filed", () => {
    const prompt = knowledgeCoverPrompt(article)!;
    expect(prompt).toContain('The treatment it covers is: "Excimer Laser".');
    expect(prompt).toContain('It is filed under: "Clinical Protocols & Technique Guidelines".');
  });

  it("passes on what the article is about", () => {
    expect(knowledgeCoverPrompt(article)!).toContain("308-nm excimer laser");
  });

  it("asks for the treatment as it is actually carried out", () => {
    // The whole complaint was a picture that could have gone on any article.
    const prompt = knowledgeCoverPrompt(article)!;
    expect(prompt).toContain("Photograph the treatment itself as it is actually carried out");
    expect(prompt).toContain("recognise it at once");
  });

  it("leaves out the parts the article does not have", () => {
    const prompt = knowledgeCoverPrompt({ title: "Skin biopsy" })!;
    expect(prompt).not.toContain("The treatment it covers is");
    expect(prompt).not.toContain("It is filed under");
    expect(prompt).not.toContain("What it is about");
    expect(prompt).toContain('titled: "Skin biopsy"');
  });

  it("makes nothing from no article at all", () => {
    // A picture generated from nothing is the irrelevant stock photo this
    // replaced, and it would spend a credit producing it.
    expect(knowledgeCoverPrompt({ title: "" })).toBe(null);
    expect(knowledgeCoverPrompt({ title: "   \n " })).toBe(null);
    expect(knowledgeCoverPrompt({ title: null })).toBe(null);
  });
});

describe("what the picture may never be", () => {
  it("asks for a photograph and bars the diagram outright", () => {
    // The diagram IS the bug: cross-sections cropped into a card header.
    const prompt = knowledgeCoverPrompt(article)!;
    expect(prompt).toContain("A real photograph - never a diagram, illustration, drawing, chart, cross-section or anatomical rendering.");
  });

  it("carries every one of the rules", () => {
    const prompt = knowledgeCoverPrompt(article)!;
    for (const rule of COVER_RULES) expect(prompt).toContain(rule);
    expect(COVER_RULES.length).toBe(5);
  });

  it("will not show the condition, a face, or a before-and-after", () => {
    const joined = COVER_RULES.join(" ");
    expect(joined).toContain("no lesions, rashes, wounds, bleeding, acne or hair loss");
    expect(joined).toContain("No identifiable faces.");
    expect(joined).toContain("No before-and-after comparison");
    expect(joined).toContain("No text, lettering, logos");
  });

  it("hands the article over as data, not as instructions", () => {
    // An article's wording must not be able to steer the picture past the
    // rules, which is why they are stated last.
    const prompt = knowledgeCoverPrompt(article)!;
    const at = prompt.indexOf(DATA_NOT_INSTRUCTIONS);
    expect(at).toBeGreaterThan(-1);
    for (const rule of COVER_RULES) expect(prompt.indexOf(rule)).toBeGreaterThan(at);
  });
});

describe("what is let through", () => {
  it("flattens whitespace so nothing is smuggled in on its own line", () => {
    expect(coverTitle("  Laser\n\n  Toning  ")).toBe("Laser Toning");
    expect(coverName(" Skin \t Booster ")).toBe("Skin Booster");
  });

  it("caps the length of each part", () => {
    expect(coverTitle("x".repeat(500))).toHaveLength(MAX_TITLE_CHARS);
    expect(coverSummary("y".repeat(900))).toHaveLength(MAX_SUMMARY_CHARS);
    expect(coverName("z".repeat(300))).toHaveLength(80);
  });

  it("survives an article field that is not a string", () => {
    expect(coverTitle(undefined)).toBe("");
    expect(coverName(null)).toBe("");
    expect(coverSummary(42)).toBe("42");
  });
});

describe("the edge function and the library agree", () => {
  // Two copies of a safety rule is how one of them gets forgotten.
  const fn = read(FN);

  it("carries the same rules, word for word", () => {
    for (const rule of COVER_RULES) expect(fn).toContain(rule);
  });

  it("carries the same data-not-instructions line", () => {
    expect(fn).toContain(DATA_NOT_INSTRUCTIONS);
  });

  it("carries the same caps", () => {
    expect(fn).toContain(`const MAX_TITLE_CHARS = ${MAX_TITLE_CHARS};`);
    expect(fn).toContain(`const MAX_SUMMARY_CHARS = ${MAX_SUMMARY_CHARS};`);
  });

  it("builds the same sentences", () => {
    const prompt = knowledgeCoverPrompt(article)!;
    for (const phrase of [
      "Photograph the treatment itself as it is actually carried out",
      "Real photography, clean and clinical, naturally lit.",
      "Gloved hands or a clinician may appear where it helps the picture make sense.",
    ]) {
      expect(prompt).toContain(phrase);
      expect(fn).toContain(phrase);
    }
  });
});

describe("the edge function keeps the app's bargain", () => {
  const fn = code(FN);

  it("stores nothing at all", () => {
    // It returns frames. Only the clinician pressing Keep stores anything.
    expect(fn).not.toMatch(/\.upload\(/);
    expect(fn).not.toMatch(/cover_image_path/);
    expect(fn).not.toMatch(/\.update\(|\.insert\(/);
  });

  it("asks the caller's own client for the article, never an admin one", () => {
    // An id in the request body is never trusted on its own.
    const at = fn.indexOf('.from("knowledge_articles")');
    expect(at).toBeGreaterThan(-1);
    expect(fn.slice(Math.max(0, at - 120), at)).toContain("caller");
  });

  it("is staff-only, and signed in", () => {
    expect(fn).toContain('caller.rpc("is_active_staff")');
    expect(fn).toContain("Please sign in");
  });

  it("keeps the gateway server-side", () => {
    expect(fn).toContain("https://ai.gateway.lovable.dev/v1/images/generations");
    expect(fn).toContain('Deno.env.get("LOVABLE_API_KEY")');
  });

  it("remembers a refusal rather than spending the wait again", () => {
    expect(fn).toContain('.eq("id", "knowledge_cover")');
    expect(fn).toContain("upstream.status === 402 || upstream.status === 403");
  });

  it("asks for a landscape picture, which is the shape of the card banner", () => {
    expect(fn).toContain('size: "1536x1024"');
  });
});

describe("what it says when Generate fails", () => {
  it("explains a request that never arrived", () => {
    // "Failed to fetch" is what the clinic saw. The commonest cause is the
    // function not being deployed: a missing Supabase function fails the
    // CORS preflight, so the browser reports a network failure rather than
    // the 404 underneath it.
    const said = coverErrorMessage(new TypeError("Failed to fetch"));
    expect(said).toContain("Could not reach the cover picture service");
    expect(said).not.toContain("Failed to fetch");
  });

  it("recognises the other browsers' wording for the same thing", () => {
    for (const wording of ["Load failed", "NetworkError when attempting to fetch resource.", "fetch failed"]) {
      expect(coverErrorMessage(new TypeError(wording))).toContain("Could not reach");
    }
  });

  it("passes on what the gateway actually said", () => {
    // A real answer - out of credits, refused - is worth showing as it is.
    expect(coverErrorMessage(new Error("You have run out of AI credits."))).toBe("You have run out of AI credits.");
  });

  it("always says something", () => {
    expect(coverErrorMessage(new Error("   "))).toBe("Could not make a picture.");
    expect(coverErrorMessage(undefined)).toBe("Could not make a picture.");
  });

  it("is what the editor shows", () => {
    expect(code(FIELD)).toContain("toast.error(coverErrorMessage(e))");
  });
});

describe("the editor stores nothing until Keep", () => {
  const field = code(FIELD);

  it("holds the generated picture in the browser", () => {
    expect(field).toContain("const [frame, setFrame] = useState(\"\")");
    expect(field).toContain("setFrame(url); setFrameDone(complete);");
  });

  it("uploads only from Keep, and only once it has finished", () => {
    const at = field.indexOf("const keep = async () => {");
    const end = field.indexOf("const discard", at);
    expect(at).toBeGreaterThan(-1);
    const body = field.slice(at, end);
    expect(body).toContain("if (!frame || !frameDone) return;");
    expect(body).toContain("await store(");
  });

  it("throws it away on Discard without storing it", () => {
    const at = field.indexOf("const discard = () =>");
    const line = field.slice(at, field.indexOf("\n", at));
    expect(line).toContain('setFrame("")');
    expect(line).not.toContain("store(");
  });

  it("refuses to generate from an article with no title", () => {
    expect(field).toContain("if (!knowledgeCoverPrompt(subject))");
  });
});
