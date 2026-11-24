import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FOLLOWUP_BODIES,
  FOLLOWUP_KINDS,
  followupContactNotice,
  followupGreeting,
  followupMessage,
  followupShareState,
  isFollowupMessage,
} from "./followupSend";
import { isSendableName, titleFromGender } from "./patientName";
import {
  isSendableName as serverIsSendableName,
  titleFromGender as serverTitleFromGender,
} from "../../supabase/functions/_shared/patient-greeting";
import { FOLLOWUP_BODIES as TEMPLATE_BODIES } from "../../supabase/functions/send-followup-whatsapp/template";

/**
 * The two follow-up buttons, now that they open WhatsApp rather than send.
 *
 * The clinic deleted both approved Meta templates on 10 Nov 2026, so the
 * wording is ours again and the patient's name can go in automatically - which
 * it could not while a template variable had to be approved for it.
 */

const female = { first_name: "Surekha", last_name: "", gender: "Female" };

describe("how the clinic addresses the patient", () => {
  it("puts the name in automatically", () => {
    expect(followupGreeting(female)).toBe("Hello Ms. Surekha,");
    expect(followupGreeting({ first_name: "Rahul", last_name: "Bhat", gender: "Male" })).toBe(
      "Hello Mr. Rahul Bhat,",
    );
  });

  it("drops the title when gender is not recorded", () => {
    // 30 patients. A guess here is worse than no title.
    expect(followupGreeting({ first_name: "Ahalya", last_name: "", gender: null })).toBe("Hello Ahalya,");
    expect(followupGreeting({ first_name: "Ahalya", last_name: "", gender: "Other" })).toBe("Hello Ahalya,");
  });

  it("does not stack a title onto a name that already has one", () => {
    // 642 patients already carry one, 633 of them a "Dr"/"Dr.".
    expect(followupGreeting({ first_name: "Dr. Krithi", last_name: "", gender: "Female" })).toBe(
      "Hello Dr. Krithi,",
    );
  });

  it("falls back to a plain Hello when the name cannot be used", () => {
    // 161 patients: 153 hold a phone number where the name should be, 8 have a
    // single character. These used to DISABLE the button; now they just lose
    // the name, which is the better failure.
    expect(followupGreeting({ first_name: "9663438657", last_name: "", gender: "Female" })).toBe("Hello,");
    expect(followupGreeting({ first_name: "A", last_name: "", gender: "Female" })).toBe("Hello,");
    expect(followupGreeting(null)).toBe("Hello,");
    // No stray space before the comma, which is what a naive template would do.
    expect(followupGreeting(null)).not.toContain(" ,");
  });
});

describe("the message the clinic asked for", () => {
  it("the 24-hour message is exactly what was given, with the name added", () => {
    expect(followupMessage("24h", female)).toBe(
      "Hello Ms. Surekha,\n" +
        "This is a quick follow-up regarding your treatment done. We wanted to check how are you doing after the treatment.\n" +
        "\n" +
        "Please continue the prescribed medications and aftercare as advised by the doctor.\n" +
        "We are always here to help you.\n" +
        "Looking forward to your feedback.\n" +
        "\n" +
        "Warm regards,\n" +
        "The Skin Clinic",
    );
  });

  it("the 1-week message is exactly what was given, with the name added", () => {
    expect(followupMessage("1week", female)).toBe(
      "Hello Ms. Surekha,\n" +
        "This is a one week follow up. How are you after the treatment?\n" +
        "Kindly reply regarding the same.\n" +
        "Thanks and regards\n" +
        "The Skin Clinic Team",
    );
  });

  it("leaves no placeholder behind", () => {
    for (const { kind } of FOLLOWUP_KINDS) {
      expect(followupMessage(kind, female)).not.toContain("{greeting}");
      expect(followupMessage(kind, null)).not.toContain("{greeting}");
      // {{1}} belonged to the Meta template and must not survive into a typed
      // WhatsApp message.
      expect(followupMessage(kind, female)).not.toContain("{{");
    }
  });

  it("carries no double spaces or trailing whitespace", () => {
    for (const [kind, body] of Object.entries(FOLLOWUP_BODIES)) {
      expect(body, `${kind} has a double space`).not.toMatch(/ {2}/);
      expect(body, `${kind} has trailing whitespace on a line`).not.toMatch(/[ \t]+\n/);
      expect(body, `${kind} ends with whitespace`).toBe(body.trimEnd());
    }
  });

  it("says the same thing as the switched-off template sender", () => {
    // send-followup-whatsapp is kept in place, not deleted, so it can be
    // switched back on if templates are ever approved again. If these two
    // drift, the same patient gets different words depending on a setting
    // nobody remembers.
    for (const { kind } of FOLLOWUP_KINDS) {
      expect(FOLLOWUP_BODIES[kind].replace("{greeting}", "Hello {{1}},")).toBe(TEMPLATE_BODIES[kind]);
    }
  });
});

describe("the WhatsApp link", () => {
  it("goes straight to web.whatsapp.com, never through wa.me", () => {
    // wa.me redirects through api.whatsapp.com, which refuses to be framed and
    // gives staff "api.whatsapp.com is blocked / ERR_BLOCKED_BY_RESPONSE".
    const url = followupShareState("9606342269", female, "24h").url ?? "";
    expect(url.startsWith("https://web.whatsapp.com/send?")).toBe(true);
    expect(url).not.toContain("wa.me");
    expect(url).not.toContain("api.whatsapp.com");
  });

  it("carries the number in full and the message as the text", () => {
    const url = new URL(followupShareState("9606342269", female, "1week").url ?? "");
    expect(url.searchParams.get("phone")).toBe("919606342269");
    expect(url.searchParams.get("text")).toBe(followupMessage("1week", female));
  });

  it("sends each kind's own words", () => {
    const a = new URL(followupShareState("9606342269", female, "24h").url ?? "");
    const b = new URL(followupShareState("9606342269", female, "1week").url ?? "");
    expect(a.searchParams.get("text")).toContain("quick follow-up regarding your treatment");
    expect(b.searchParams.get("text")).toContain("one week follow up");
    expect(a.searchParams.get("text")).not.toBe(b.searchParams.get("text"));
  });

  it("is disabled ONLY when there is no usable number", () => {
    const none = followupShareState("", female, "24h");
    expect(none.enabled).toBe(false);
    expect(none.url).toBeNull();
    expect(none.reason).toContain("no usable phone number");
    expect(followupShareState("12345", female, "24h").enabled).toBe(false);
  });

  it("is still enabled for a patient whose name cannot be used", () => {
    // The change of heart: the name used to gate the button because a Meta
    // template cannot take an empty variable. Typed text can.
    const state = followupShareState("9606342269", { first_name: "9663438657", last_name: "" }, "24h");
    expect(state.enabled).toBe(true);
    expect(new URL(state.url!).searchParams.get("text")).toContain("Hello,");
  });
});

describe("recognising a follow-up this patient already had", () => {
  it("recognises the one that really was sent before the templates went", () => {
    // Ms. Surekha, 10 Nov 2026, through the old template sender. If this stops
    // matching, she is offered the same message again as though new.
    const real =
      "Hello Ms. Surekha,\nThis is a quick follow-up regarding your treatment done. " +
      "We wanted to check how are you doing after the treatment.";
    expect(isFollowupMessage("24h", real)).toBe(true);
    expect(isFollowupMessage("1week", real)).toBe(false);
  });

  it("recognises the words that go out now", () => {
    for (const { kind } of FOLLOWUP_KINDS) {
      expect(isFollowupMessage(kind, followupMessage(kind, female))).toBe(true);
    }
    expect(isFollowupMessage("24h", followupMessage("1week", female))).toBe(false);
    expect(isFollowupMessage("1week", followupMessage("24h", female))).toBe(false);
  });

  it("recognises the old sender's fallback line", () => {
    expect(isFollowupMessage("24h", "24-hour follow-up sent using the approved clinic template.")).toBe(true);
    expect(isFollowupMessage("1week", "1-week follow-up sent using the approved clinic template.")).toBe(true);
  });

  it("claims nothing from an unrelated message", () => {
    expect(isFollowupMessage("24h", "Your appointment is confirmed for 12 Nov.")).toBe(false);
    expect(isFollowupMessage("1week", "")).toBe(false);
    expect(isFollowupMessage("1week", null)).toBe(false);
  });
});

describe("the notice above the buttons", () => {
  const now = new Date("2026-11-10T12:00:00Z");
  const earlier = new Date("2026-11-10T06:14:00Z");
  const yesterday = new Date("2026-11-09T06:14:00Z");

  it("says nothing when the patient has never been contacted", () => {
    expect(followupContactNotice(null, null, now)).toBe("");
  });

  it("says 'sent' only for a message the app really sent", () => {
    expect(followupContactNotice(earlier, null, now)).toContain("Already sent");
  });

  it("says 'opened' for a staff member opening WhatsApp, which is not a send", () => {
    // We cannot see whether they pressed send, let alone whether it arrived.
    const notice = followupContactNotice(null, earlier, now);
    expect(notice).toContain("Follow-up opened");
    expect(notice).not.toContain("sent");
  });

  it("reports the later of the two, with a tie going to the confirmed send", () => {
    expect(followupContactNotice(earlier, yesterday, now)).toContain("Already sent");
    expect(followupContactNotice(yesterday, earlier, now)).toContain("Follow-up opened");
    expect(followupContactNotice(earlier, earlier, now)).toContain("Already sent");
  });
});

describe("the browser rule and the server rule are the same rule", () => {
  // Restated rather than shared, because Deno cannot import from the browser
  // bundle. The appointment confirmations are addressed by the server copy and
  // these follow-ups by the browser one, so the same patient must not be "Ms."
  // in one message and something else in the next.
  for (const g of ["Female", "female", "FEMALE", "Male", "m", "Other", "", null]) {
    it(`agrees on gender ${JSON.stringify(g)}`, () => {
      expect(titleFromGender(g)).toBe(serverTitleFromGender(g));
    });
  }
  for (const n of ["Surekha", "A", "", " ", "9663438657", "+91 96634 38657", "Dr. Krithi", "Jo", "-"]) {
    it(`agrees on name ${JSON.stringify(n)}`, () => {
      expect(isSendableName(n)).toBe(serverIsSendableName(n));
    });
  }
});

const stripComments = (text: string) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("the one place that opens WhatsApp", () => {
  // The three rules used to be written out in each button. Two copies of three
  // subtle rules is one copy too many, so they live here now - and so do these
  // checks. Comments are stripped first: the file spells out the traps it
  // avoids ("noopener", "alert()"), and a plain search finds the warning and
  // reports it as the mistake.
  const raw = () => readFileSync("src/lib/whatsappOpen.ts", "utf8");
  const src = () => stripComments(raw());

  it("strips comments before looking, or these checks prove nothing", () => {
    expect(raw()).toContain("noopener");
    expect(src()).not.toContain("noopener");
  });

  it("hands the message to the desktop app, not to a new tab", () => {
    // "_blank" was the bug: a new tab on every click, and a web address the
    // browser keeps to itself instead of passing to WhatsApp Desktop.
    const text = src();
    expect(text).not.toContain('"_blank"');
    expect(text).toContain("launchDesktopApp(whatsappAppUrl(url))");
  });

  it("reuses one named tab when it does fall back to the web", () => {
    const text = src();
    expect(text).toContain("window.open(url, WHATSAPP_WINDOW_NAME)");
    expect(text).not.toContain("noopener");
    expect(text).toContain("win.opener = null");
  });

  it("launches the protocol through an anchor, not the address bar", () => {
    // location.href takes the clinic's own tab away on a machine where the
    // protocol is unregistered; an iframe is blocked by modern Chrome.
    const text = src();
    expect(text).toContain("link.click()");
    expect(text).not.toContain("location.href");
    expect(text).not.toContain("createElement(\"iframe\")");
  });

  it("never puts a browser dialog between the click and the open", () => {
    const text = src();
    expect(text).not.toContain("window.confirm");
    expect(text).not.toMatch(/\balert\(/);
    expect(text).not.toMatch(/\bprompt\(/);
  });

  it("refuses to open anything at all from inside a frame", () => {
    // A popup from a sandboxed iframe inherits the sandbox, and WhatsApp
    // answers ERR_BLOCKED_BY_RESPONSE. Opening the tab anyway wastes the
    // click and, worse, looks like a send.
    const text = src();
    const guard = text.indexOf("isEmbedded()");
    const open = text.indexOf("window.open(");
    expect(guard, "nothing checks for a frame").toBeGreaterThan(-1);
    expect(guard, "the frame check runs after the tab is opened").toBeLessThan(open);
  });

  it("offers the message to copy whenever a tab is not an option", () => {
    const text = src();
    expect(text).toContain("navigator.clipboard.writeText");
    expect(text).toContain("blocked the WhatsApp tab");
  });
});

describe("the buttons are wired the way they are meant to be", () => {
  const button = () => stripComments(readFileSync("src/components/appointments/FollowupButtons.tsx", "utf8"));

  it("no longer calls the switched-off edge function", () => {
    expect(button()).not.toContain("send-followup-whatsapp");
  });

  it("goes through the shared opener rather than its own window.open", () => {
    const text = button();
    expect(text).toContain("openWhatsApp(state.url");
    expect(text).not.toContain("window.open(");
  });

  it("records the open ONLY when a tab really opened", () => {
    // Two rows were written on 10 Nov for clicks that showed a blocked page.
    // A row means a staff member had the message in front of them.
    expect(button()).toMatch(/if \(openWhatsApp\(.+\)\) recordOpen\(kind\)/);
  });

  it("records the open without making the click wait for it", () => {
    const text = button();
    expect(text).toContain('from("followup_opens" as never)');
    // An await in the click path spends the click's permission to open a tab.
    expect(text).toMatch(/const recordOpen[\s\S]{0,200}void \(async/);
  });
});
