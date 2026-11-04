import { describe, it, expect } from "vitest";
import { capitaliseFirstWord } from "./sentenceCase";

describe("capitaliseFirstWord", () => {
  it("capitalises an ordinary word", () => {
    expect(capitaliseFirstWord("acne vulgaris")).toBe("Acne vulgaris");
    expect(capitaliseFirstWord("twice a day")).toBe("Twice a day");
    expect(capitaliseFirstWord("apply after cleansing")).toBe("Apply after cleansing");
  });

  it("changes the first letter and nothing else", () => {
    // A dose, a name in capitals and anything mid-sentence stay as typed.
    expect(capitaliseFirstWord("tab calpol 650mg SOS")).toBe("Tab calpol 650mg SOS");
    expect(capitaliseFirstWord("acne with pH imbalance")).toBe("Acne with pH imbalance");
  });

  it("leaves a term the clinic writes in lower case alone", () => {
    expect(capitaliseFirstWord("pH balanced cleanser")).toBe("pH balanced cleanser");
    expect(capitaliseFirstWord("c/o itching since 3 days")).toBe("c/o itching since 3 days");
    expect(capitaliseFirstWord("k/c/o diabetes mellitus")).toBe("k/c/o diabetes mellitus");
    expect(capitaliseFirstWord("h/o atopy")).toBe("h/o atopy");
    expect(capitaliseFirstWord("mm sized lesion")).toBe("mm sized lesion");
    expect(capitaliseFirstWord("b.d. after food")).toBe("b.d. after food");
    expect(capitaliseFirstWord("prn for itching")).toBe("prn for itching");
  });

  it("leaves text that is already capitalised exactly as it is", () => {
    expect(capitaliseFirstWord("Acne vulgaris")).toBe("Acne vulgaris");
    expect(capitaliseFirstWord("ACNE VULGARIS")).toBe("ACNE VULGARIS");
  });

  it("finds the first letter past spaces, new lines and numbering", () => {
    expect(capitaliseFirstWord("  acne")).toBe("  Acne");
    expect(capitaliseFirstWord("\nacne")).toBe("\nAcne");
    expect(capitaliseFirstWord("1. tab calpol")).toBe("1. Tab calpol");
    expect(capitaliseFirstWord("- apply at night")).toBe("- Apply at night");
  });

  it("recognises the term however it was typed", () => {
    expect(capitaliseFirstWord("C/O itching")).toBe("C/O itching");
  });

  it("has nothing to do with text that holds no letters", () => {
    expect(capitaliseFirstWord("")).toBe("");
    expect(capitaliseFirstWord("   ")).toBe("   ");
    expect(capitaliseFirstWord("123 456")).toBe("123 456");
  });

  it("handles a single letter, which is how typing starts", () => {
    // A letter that begins no clinical term is capitalised straight away; one
    // that does waits, which is the case just below.
    expect(capitaliseFirstWord("a")).toBe("A");
    expect(capitaliseFirstWord("e")).toBe("E");
  });

  it("waits while the word could still become a clinical term", () => {
    // Typed one letter at a time: p, then H. Capitalising the p on its own
    // would have made PH whatever the doctor typed next.
    expect(capitaliseFirstWord("p")).toBe("p");
    expect(capitaliseFirstWord("pH")).toBe("pH");
    expect(capitaliseFirstWord("c")).toBe("c");
    expect(capitaliseFirstWord("c/o")).toBe("c/o");
    expect(capitaliseFirstWord("m")).toBe("m");
    expect(capitaliseFirstWord("b")).toBe("b");
    expect(capitaliseFirstWord("i")).toBe("i");
    expect(capitaliseFirstWord("t")).toBe("t");
  });

  it("capitalises as soon as the word stops looking like one", () => {
    expect(capitaliseFirstWord("pa")).toBe("Pa");
    expect(capitaliseFirstWord("patient complains of")).toBe("Patient complains of");
    expect(capitaliseFirstWord("ta")).toBe("Ta");
    expect(capitaliseFirstWord("tab calpol")).toBe("Tab calpol");
    expect(capitaliseFirstWord("cream at night")).toBe("Cream at night");
  });
});
