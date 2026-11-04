import { describe, it, expect } from "vitest";
import { parsePrescriptionText } from "./prescriptionText";

/**
 * Every sample here is a real prescription pulled from the clinic's own data,
 * with \r\n preserved where Salesforce sent it. The clinic's standing
 * instruction is that no data is lost, so the last block checks exactly that
 * over all of them at once: every word in goes somewhere on the way out.
 */

const SOTRET = "Prescription:\nSOTRET 20MG\n1-0-0\nALTERNATE DAY\nX 6 WEEKS\n\nTRILUMA CREAM\n0-0-1\nSATURDAY SUNDAY\nPIGMENTED SPOTS\n6 WEEKS";
const IVORAL = "T. Ivoral Forte 1 stat \r\nT. Traxido SR 500mg 0-0-1 for 2 months \r\nT. Rosfin 1-0-0- for 2 months \r\n\r\nEthiglow Facewash twice daily for face-morning/evening";
const NUMBERED = "1) T-bact cream 1-0-1 x 1 month (apply over the peri-anal skin ; mixed with candid cream) \r\n\r\n2) Candid cream (clotrimazole) 1-0-1 x 1 month \r\n\r\n3) Atoderm intensive baume 1-1-1 x to continue (Apply all over the body ) \r";
const ONE_LINER = "Triclenz shampoo - regular scalp wash";
const CONTINUE = "Continue Benzac AC Facewash on alternaet days for buttocks\r\n\r\nCuticans Cream at night for buttocks \r\n\r\nR/a 3 months";
const ACNE = "Prescription:\nAcne UV gel daytime 8am / 1pm \nAcnomega 200 -night -full face \nCetaphil gentle cleansing lotion twice daily .";

describe("a medicine written across several lines stays one medicine", () => {
  it("keeps SOTRET's dose and duration with its name, not as products of their own", () => {
    const items = parsePrescriptionText(SOTRET);
    // Two medicines, separated by the blank line - not six.
    expect(items).toHaveLength(2);
    expect(items[0].product).toBe("SOTRET 20MG\n1-0-0\nALTERNATE DAY\nX 6 WEEKS");
    expect(items[1].product).toContain("TRILUMA CREAM");
    // The failure this guards against: "1-0-0" printed as a prescribed product.
    expect(items.map((i) => i.product)).not.toContain("1-0-0");
  });

  it("drops the Prescription: label, which is not a medicine", () => {
    expect(parsePrescriptionText(SOTRET)[0].product.startsWith("SOTRET")).toBe(true);
    expect(parsePrescriptionText(ACNE)[0].product.startsWith("Acne UV gel")).toBe(true);
  });
});

describe("separator chosen per entry", () => {
  it("splits on blank lines when there are any", () => {
    // Three lines then a blank line: the first three group together rather
    // than being torn apart mid-medicine.
    expect(parsePrescriptionText(IVORAL)).toHaveLength(2);
    expect(parsePrescriptionText(CONTINUE)).toHaveLength(3);
  });

  it("splits per line when there are no blank lines", () => {
    const items = parsePrescriptionText(ACNE);
    expect(items).toHaveLength(3);
    expect(items[2].product).toBe("Cetaphil gentle cleansing lotion twice daily .");
  });

  it("rejoins a bare dose or schedule with the medicine above it", () => {
    // Same shape as SOTRET but with no blank line to separate the medicines -
    // 82 real entries look like this. Without the rejoin, "1-0-0" and
    // "X 6 WEEKS" would each print as a prescribed product.
    const items = parsePrescriptionText("SOTRET 20MG\n1-0-0\nALTERNATE DAY\nX 6 WEEKS");
    expect(items).toHaveLength(1);
    expect(items[0].product).toBe("SOTRET 20MG\n1-0-0\nALTERNATE DAY\nX 6 WEEKS");
  });

  it("does not swallow a real medicine that merely starts with a number", () => {
    const items = parsePrescriptionText("Acne UV gel daytime\n2 percent lotion for the scalp");
    expect(items).toHaveLength(2);
  });

  it("uses the numbering when the doctor wrote one, over blank lines", () => {
    expect(parsePrescriptionText(NUMBERED)).toHaveLength(3);
  });

  it("treats a single line as a single medicine", () => {
    expect(parsePrescriptionText(ONE_LINER)).toEqual([
      { product: "Triclenz shampoo - regular scalp wash", instruction: "" },
    ]);
  });
});

describe("the instruction column", () => {
  it("lifts a trailing parenthetical out as the instruction", () => {
    const [first, , third] = parsePrescriptionText(NUMBERED);
    expect(first.product).toBe("T-bact cream 1-0-1 x 1 month");
    expect(first.instruction).toBe("apply over the peri-anal skin ; mixed with candid cream");
    expect(third.instruction).toBe("Apply all over the body");
  });

  it("leaves a mid-text bracket in the product name", () => {
    // "Candid cream (clotrimazole) 1-0-1 x 1 month" - the bracket is the
    // generic name, not an instruction, and it does not trail.
    const second = parsePrescriptionText(NUMBERED)[1];
    expect(second.product).toBe("Candid cream (clotrimazole) 1-0-1 x 1 month");
    expect(second.instruction).toBe("");
  });

  it("never treats a bare parenthetical as an instruction with no product", () => {
    expect(parsePrescriptionText("(apply at night)")).toEqual([
      { product: "(apply at night)", instruction: "" },
    ]);
  });
});

describe("nothing to show", () => {
  it("returns nothing for empty, blank or header-only text", () => {
    for (const empty of [null, undefined, "", "   ", "\r\n\r\n", "Prescription:"]) {
      expect(parsePrescriptionText(empty)).toEqual([]);
    }
  });
});

describe("no data loss", () => {
  it("keeps every word of every real sample", () => {
    const words = (s: string) => s.replace(/[\s\r\n]+/g, " ").trim().split(" ").filter(Boolean);
    for (const sample of [SOTRET, IVORAL, NUMBERED, ONE_LINER, CONTINUE, ACNE]) {
      const out = parsePrescriptionText(sample)
        .map((i) => `${i.product} ${i.instruction}`)
        .join(" ");
      // Three things are structure rather than content and are allowed to go:
      // the "Prescription:" label, the "1)" list markers, and the brackets
      // around an instruction that was lifted into its own column.
      const strip = (s: string) =>
        words(
          s
            .replace(/^\s*prescriptions?\s*:/i, "")
            .replace(/(?:^|\n)[ \t]*\d+[ \t]*[).]/g, "\n")
            .replace(/[()]/g, " "),
        ).join(" ");
      expect(strip(out)).toBe(strip(sample));
    }
  });
});
