import { describe, expect, it } from "vitest";
import {
  patientHandoutHtml, UNPUBLISHED_HANDOUT_ERROR, printableImages, handoutImages,
  HANDOUT_IMAGE_LIMIT, ILLUSTRATION_CAPTION,
} from "./patientHandout";

/**
 * The handout a patient takes home.
 *
 * It leaves the building, so two things matter more than layout: it must never
 * be printable from an unpublished article, and every piece of text in it is
 * written by a person into a form and must be escaped on the way into the HTML.
 * A title is the obvious injection point because it is the one field with no
 * length limit worth speaking of and it lands in both the <title> and the <h1>.
 */

const article = (over: Record<string, unknown> = {}) => ({
  title: "Laser hair reduction",
  status: "published",
  is_active: true,
  patient_summary: "Laser treatment makes hair grow back finer and slower.\n\nYou will need a few visits.",
  patient_facts: {
    sessions: "6 to 8 sessions", downtime: "None",
    dos: ["Use sunscreen every day"],
    donts: ["Do not wax between sessions"],
    timeline: [{ when: "Before", what: "Shave the area the day before" }],
  },
  ...over,
} as Parameters<typeof patientHandoutHtml>[0]);

describe("what gets printed", () => {
  it("carries the summary, the cards, the lists and the timeline", () => {
    const html = patientHandoutHtml(article());
    expect(html).toContain("Laser treatment makes hair grow back finer");
    expect(html).toContain("6 to 8 sessions");
    expect(html).toContain("Use sunscreen every day");
    expect(html).toContain("Do not wax between sessions");
    expect(html).toContain("Shave the area the day before");
  });

  it("splits blank-line separated text into paragraphs", () => {
    const html = patientHandoutHtml(article());
    expect(html).toContain("<p>Laser treatment makes hair grow back finer and slower.</p>");
    expect(html).toContain("<p>You will need a few visits.</p>");
  });

  it("says it is not personal medical advice", () => {
    expect(patientHandoutHtml(article())).toMatch(/not personal medical advice/i);
  });

  it("marks Do and Don't with a tick and a cross, not only colour", () => {
    // A clinic printer is usually monochrome. If colour were the only
    // difference, the two lists would print identically.
    const html = patientHandoutHtml(article());
    expect(html).toContain("✓");
    expect(html).toContain("✗");
  });

  it("prefers the service name over the article's own title as the heading", () => {
    // The clinic's real titles read "FACE HAIR REDUCTION - All ages - All
    // genders": a filing label, not something to hand to a patient. The two
    // must differ here or this proves nothing.
    const html = patientHandoutHtml(
      article({ title: "FACE HAIR REDUCTION - All ages - All genders" }),
      { serviceName: "Laser hair reduction" },
    );
    expect(html).toContain("<h1>Laser hair reduction</h1>");
    expect(html).not.toContain("All ages - All genders");
  });

  it("falls back to the article title when no service name is given", () => {
    const html = patientHandoutHtml(article({ title: "Laser hair reduction" }));
    expect(html).toContain("<h1>Laser hair reduction</h1>");
  });

  it("leaves out a section nobody filled in, rather than printing an empty heading", () => {
    const html = patientHandoutHtml(article({ patient_facts: { sessions: "6 sessions" } }));
    expect(html).not.toContain("Please do");
    expect(html).not.toContain("What happens, and when");
    expect(html).toContain("6 sessions");
  });
});

describe("nothing unreviewed reaches a patient's hand", () => {
  it("refuses a draft", () => {
    expect(() => patientHandoutHtml(article({ status: "draft" }))).toThrow(UNPUBLISHED_HANDOUT_ERROR);
  });

  it("refuses an article that is published but deactivated", () => {
    expect(() => patientHandoutHtml(article({ is_active: false }))).toThrow(UNPUBLISHED_HANDOUT_ERROR);
  });

  it("refuses an article with nothing written for the patient", () => {
    expect(() => patientHandoutHtml(article({ patient_summary: "", patient_facts: {} })))
      .toThrow(UNPUBLISHED_HANDOUT_ERROR);
  });
});

describe("the pictures", () => {
  const picture = (over: Record<string, unknown> = {}) =>
    ({ id: "r1", kind: "image", title: "Diagram", path: "a/b/c.png", ...over }) as never;

  it("prints an img for each one given", () => {
    const html = patientHandoutHtml(article(), { images: ["data:image/png;base64,AAA", "https://x/y.png"] });
    expect(html).toContain('<img src="data:image/png;base64,AAA"');
    expect(html).toContain('<img src="https://x/y.png"');
  });

  it("says the drawing is not a photograph of the patient", () => {
    const html = patientHandoutHtml(article(), { images: ["data:image/png;base64,AAA"] });
    expect(html).toContain(ILLUSTRATION_CAPTION);
    expect(ILLUSTRATION_CAPTION).toMatch(/not a photograph/i);
  });

  it("leaves the whole section out when there are none", () => {
    const html = patientHandoutHtml(article(), { images: [] });
    expect(html).not.toContain("<img");
    expect(html).not.toContain(ILLUSTRATION_CAPTION);
    expect(html).not.toContain('class="pictures"');
  });

  it("puts them between the cards and the do/don't lists, as on screen", () => {
    const html = patientHandoutHtml(article(), { images: ["data:image/png;base64,AAA"] });
    expect(html.indexOf('class="cards"')).toBeLessThan(html.indexOf("<img"));
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("Please do"));
  });

  it("escapes a hostile src rather than letting it close the attribute", () => {
    const html = patientHandoutHtml(article(), { images: ['" onerror="alert(1)'] });
    expect(html).not.toContain('onerror="alert(1)"');
    expect(html).toContain("&quot; onerror=&quot;alert(1)");
  });

  describe("choosing which to print", () => {
    it("takes the images and nothing else, in order", () => {
      const chosen = printableImages([
        { id: "1", kind: "link", title: "A guideline", url: "https://x" },
        picture({ id: "2", title: "First" }),
        { id: "3", kind: "video", title: "A video", path: "a/b/c.mp4" },
        picture({ id: "4", title: "Second" }),
        { id: "5", kind: "file", title: "A PDF", path: "a/b/c.pdf" },
      ]);
      expect(chosen.map((r) => r.title)).toEqual(["First", "Second"]);
    });

    it("stops at the limit rather than filling the page", () => {
      const many = Array.from({ length: 6 }, (_, i) => picture({ id: String(i), title: `P${i}` }));
      expect(printableImages(many)).toHaveLength(HANDOUT_IMAGE_LIMIT);
      expect(printableImages(many, 1).map((r) => r.title)).toEqual(["P0"]);
    });

    it("copes with an article that has no resources at all", () => {
      expect(printableImages(null)).toEqual([]);
      expect(printableImages("not an array")).toEqual([]);
    });
  });

  describe("resolving them", () => {
    it("returns what resolved, in order", async () => {
      const images = await handoutImages(
        [picture({ id: "1", title: "a" }), picture({ id: "2", title: "b" })],
        async (r) => `data:${r.title}`,
      );
      expect(images).toEqual(["data:a", "data:b"]);
    });

    it("drops one that fails rather than losing the whole handout", async () => {
      // A signed URL expires, a file goes missing, a network drops. The patient
      // should lose a diagram, not leave with nothing.
      const images = await handoutImages(
        [picture({ id: "1", title: "a" }), picture({ id: "2", title: "b" }), picture({ id: "3", title: "c" })],
        async (r) => {
          if (r.title === "b") throw new Error("gone");
          return r.title === "c" ? null : `data:${r.title}`;
        },
        3,
      );
      expect(images).toEqual(["data:a"]);
    });

    it("never asks for more than the limit", async () => {
      const asked: string[] = [];
      await handoutImages(
        Array.from({ length: 5 }, (_, i) => picture({ id: String(i), title: `P${i}` })),
        async (r) => { asked.push(r.title); return "data:x"; },
      );
      expect(asked).toHaveLength(HANDOUT_IMAGE_LIMIT);
    });
  });
});

describe("escaping", () => {
  it("escapes a title containing markup, in both places it appears", () => {
    const html = patientHandoutHtml(article({ title: `<script>alert(1)</script>` }));
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes the summary and every list item", () => {
    const html = patientHandoutHtml(article({
      patient_summary: `5 > 3 & "quoted"`,
      patient_facts: { dos: ["<b>bold</b>"], sessions: `<i>six</i>` },
    }));
    expect(html).toContain("5 &gt; 3 &amp; &quot;quoted&quot;");
    expect(html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(html).toContain("&lt;i&gt;six&lt;/i&gt;");
    expect(html).not.toContain("<b>bold</b>");
  });

  it("escapes a timeline step", () => {
    const html = patientHandoutHtml(article({
      patient_facts: { timeline: [{ when: "<em>Before</em>", what: "<img src=x>" }] },
    }));
    expect(html).toContain("&lt;em&gt;Before&lt;/em&gt;");
    expect(html).not.toContain("<img src=x>");
  });

  it("keeps a single newline inside a paragraph as a line break, still escaped", () => {
    const html = patientHandoutHtml(article({ patient_summary: "One line\n<b>next</b>" }));
    expect(html).toContain("One line<br>&lt;b&gt;next&lt;/b&gt;");
  });
});
