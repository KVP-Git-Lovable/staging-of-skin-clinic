import { describe, it, expect } from "vitest";
import { buildPrefixFilter, buildTokenFilters, fuzzyScore, fuzzyRank, wordStartBonus } from "./fuzzySearch";

/**
 * The clinic searched "nisha rai" and got Dr Supriya Rai, NISHA DSOUZA,
 * Ashritha Rai, Nisha, Punya Rai and Sulan Raiker - six people, none of them
 * called Nisha Rai - while the actual Anisha Rai was pushed below the patients
 * section entirely.
 *
 * Two separate things were OR-ing where they should have been AND-ing: the
 * PostgREST filter, and the ranking that ordered whatever came back.
 */

const PATIENT_COLS = ["first_name", "last_name", "phone", "email"];

describe("buildTokenFilters", () => {
  it("gives one filter per word, so the caller can AND them", () => {
    // Applied as separate .or() calls, which PostgREST ANDs together.
    const filters = buildTokenFilters("nisha rai", PATIENT_COLS);
    expect(filters).toHaveLength(2);
    expect(filters[0]).toContain("first_name.ilike.%nisha%");
    expect(filters[0]).toContain("last_name.ilike.%nisha%");
    expect(filters[1]).toContain("first_name.ilike.%rai%");
    expect(filters[1]).not.toContain("nisha");
  });

  it("covers every column for each word, so a phone or email still matches", () => {
    const [only] = buildTokenFilters("9845", PATIENT_COLS);
    for (const col of PATIENT_COLS) expect(only).toContain(`${col}.ilike.%9845%`);
  });

  it("leaves a single word exactly as loose as it was", () => {
    expect(buildTokenFilters("rai", PATIENT_COLS)).toHaveLength(1);
  });

  it("does not repeat a word typed twice", () => {
    expect(buildTokenFilters("rai rai", PATIENT_COLS)).toHaveLength(1);
  });

  it("has nothing to say about an empty search", () => {
    expect(buildTokenFilters("", PATIENT_COLS)).toEqual([]);
    expect(buildTokenFilters("   ", PATIENT_COLS)).toEqual([]);
    expect(buildTokenFilters("rai", [])).toEqual([]);
  });

  it("strips the characters that would break a PostgREST filter", () => {
    // %, ( ) and * are the ones that corrupt an or(...) expression. The % here
    // splits the word in two, which is correct - it is not part of the name.
    const filters = buildTokenFilters("o'br%ien(x)", ["last_name"]);
    for (const f of filters) {
      expect(f).not.toContain("(");
      expect(f).not.toContain(")");
      expect(f).not.toContain("*");
      // Only the wildcards the builder itself adds remain.
      expect(f.match(/%/g)?.length).toBe(2);
    }
  });
});

describe("fuzzyScore - the weakest word decides", () => {
  it("no longer scores another Rai as a perfect match for nisha rai", () => {
    // This is the bug: "rai" alone used to carry the whole score.
    expect(fuzzyScore("nisha rai", "Punya Rai")).toBeLessThan(0.45);
    expect(fuzzyScore("nisha rai", "Sulan Raiker")).toBeLessThan(0.45);
    expect(fuzzyScore("nisha rai", "Ashritha Rai")).toBeLessThan(0.45);
  });

  it("keeps the person actually being looked for at the top", () => {
    expect(fuzzyScore("nisha rai", "Anisha Rai")).toBeGreaterThan(0.8);
  });

  it("treats a single word exactly as before", () => {
    expect(fuzzyScore("rai", "Punya Rai")).toBeGreaterThan(0.8);
    expect(fuzzyScore("rai", "Ashritha Rai")).toBeGreaterThan(0.8);
  });

  it("still matches the whole term as a substring", () => {
    expect(fuzzyScore("anisha rai", "Anisha Rai")).toBe(1);
  });

  it("still tolerates a typo in one word", () => {
    expect(fuzzyScore("anisha rau", "Anisha Rai")).toBeGreaterThan(0.6);
  });

  it("gives nothing for an empty side", () => {
    expect(fuzzyScore("", "Anisha Rai")).toBe(0);
    expect(fuzzyScore("nisha", "")).toBe(0);
  });
});

describe("fuzzyRank on the reported search", () => {
  it("returns Anisha Rai and drops the other Rais", () => {
    const rows = [
      { name: "Dr Supriya Rai" },
      { name: "NISHA DSOUZA" },
      { name: "Ashritha Rai" },
      { name: "Anisha Rai" },
      { name: "Punya Rai" },
      { name: "Sulan Raiker" },
    ];
    const ranked = fuzzyRank(rows, "nisha rai", (r) => r.name, 0.45);
    expect(ranked.map((r) => r.name)).toEqual(["Anisha Rai"]);
  });
});

/**
 * The reported search: typing "uma" in the global search returned Heema Kumari,
 * Amar Kumar, Arun Kumar, Rathan kumar, Mariam Numa and Kumar - not one of the
 * clinic's 32 patients called Uma. Two separate causes, one test block each.
 */

describe("buildPrefixFilter - fetching the people who are actually meant", () => {
  const COLS = ["first_name", "last_name", "phone"];

  it("asks for names that begin with the term, not names containing it", () => {
    expect(buildPrefixFilter("uma", COLS)).toBe(
      "first_name.ilike.uma%,last_name.ilike.uma%,phone.ilike.uma%"
    );
  });

  it("is a prefix, so it cannot match mid-word the way %uma% did", () => {
    // 756 patients contain "uma"; 33 begin with it. This is the difference.
    expect(buildPrefixFilter("uma", COLS)).not.toContain("%uma");
  });

  it("stays out of the way of a multi-word search", () => {
    // "nisha rai" is buildTokenFilters' job - a prefix of two words is not a
    // prefix of anything, and that search already works.
    expect(buildPrefixFilter("nisha rai", COLS)).toBe("");
  });

  it("has nothing to ask for when nothing was typed", () => {
    expect(buildPrefixFilter("", COLS)).toBe("");
    expect(buildPrefixFilter("   ", COLS)).toBe("");
    expect(buildPrefixFilter("uma", [])).toBe("");
  });

  it("cannot be broken by punctuation a name might carry", () => {
    expect(buildPrefixFilter("o'br%ien(x)", ["last_name"])).toBe("");
    expect(buildPrefixFilter("d%souza", ["last_name"])).toBe("");
  });
});

describe("wordStartBonus - telling Uma from Kumari", () => {
  it("is earned by a name that starts with the term", () => {
    expect(wordStartBonus("uma", "Uma M S")).toBe(1);
    expect(wordStartBonus("uma", "Umaira")).toBe(1);
    expect(wordStartBonus("uma", "Uma Kumari")).toBe(1);
  });

  it("is not earned by a name that merely contains it - the reported rows", () => {
    expect(wordStartBonus("uma", "Heema Kumari")).toBe(0);
    expect(wordStartBonus("uma", "Amar Kumar")).toBe(0);
    expect(wordStartBonus("uma", "Mariam Numa")).toBe(0);
  });

  it("is earned on a surname too, so nobody is lost by the name they go by", () => {
    expect(wordStartBonus("kumari", "Heema Kumari")).toBe(1);
  });

  it("needs every word typed to start a word, not just one of them", () => {
    expect(wordStartBonus("nisha rai", "Nisha Rai")).toBe(1);
    expect(wordStartBonus("nisha rai", "Anisha Raikar")).toBe(0);
  });

  it("is nothing at all when there is nothing to compare", () => {
    expect(wordStartBonus("", "Uma M S")).toBe(0);
    expect(wordStartBonus("uma", "")).toBe(0);
  });
});

describe("fuzzyRank on the reported search for 'uma'", () => {
  // Deliberately in the order the screenshot showed them, with the Uma last.
  const rows = [
    { name: "Heema Kumari" },
    { name: "Amar Kumar" },
    { name: "Mariam Numa" },
    { name: "Uma M S" },
  ];

  it("puts the patient actually called Uma first", () => {
    // Every one of these scores exactly 1 - each contains "uma" - so before the
    // tiebreak the input order survived untouched and Uma came last.
    const ranked = fuzzyRank(rows, "uma", (r) => r.name, 0.45);
    expect(ranked[0].name).toBe("Uma M S");
  });

  it("does not drop the others, which are still matches", () => {
    expect(fuzzyRank(rows, "uma", (r) => r.name, 0.45)).toHaveLength(4);
  });

  it("still ranks on the score first, so a better match cannot be demoted", () => {
    const mixed = [{ name: "Umaira Begum" }, { name: "Punya Rai" }];
    // "rai" scores 1 against Punya Rai and ~0 against Umaira Begum; the bonus
    // must not reorder rows the score already separates.
    expect(fuzzyRank(mixed, "rai", (r) => r.name, 0.45)[0].name).toBe("Punya Rai");
  });

  it("leaves the earlier 'nisha rai' fix exactly as it was", () => {
    const rais = [
      { name: "Punya Rai" },
      { name: "Anisha Rai" },
      { name: "Sulan Raiker" },
    ];
    const ranked = fuzzyRank(rais, "nisha rai", (r) => r.name, 0.45);
    expect(ranked.map((r) => r.name)).toEqual(["Anisha Rai"]);
  });
});
