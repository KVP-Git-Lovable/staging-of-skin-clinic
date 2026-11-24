import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  FOLLOWUP_BODIES,
  FOLLOWUP_TEMPLATES,
  followupSessionParams,
  followupTemplateParams,
  followupText,
  isDeletedTemplateError,
  isWithinServiceWindow,
} from "../../supabase/functions/send-followup-whatsapp/template";
import {
  isSendableName,
  patientGreeting,
  titleFromGender,
} from "../../supabase/functions/_shared/patient-greeting";

/**
 * The two post-treatment follow-ups, as the TEMPLATE SENDER would send them.
 *
 * That sender has been switched off since the clinic deleted both approved
 * Meta templates on 10 Nov 2026; the buttons open WhatsApp directly now. These
 * tests are kept because the function is kept, and because followupSend.test.ts
 * holds the wording here against the wording that actually goes out - so the
 * two cannot drift apart while this path sleeps.
 *
 * Edge functions are outside the app's tsconfig and there is no Deno here, so
 * the pure helpers carry the coverage - the same arrangement
 * googleReviewSend.test.ts uses for the review sender.
 */

const FROM = "+911234567890";
const TO = "+919606342269";

describe("the approved bodies", () => {
  // Meta approves a body character for character. If these drift from what
  // was submitted, the free-text version sent inside the 24-hour window stops
  // matching the template version sent outside it, and the same patient gets
  // two different messages depending on when they last wrote.
  it("the 24-hour body is exactly what was submitted", () => {
    expect(FOLLOWUP_BODIES["24h"]).toBe(
      "Hello {{1}},\n" +
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

  it("the 1-week body is exactly what was submitted", () => {
    expect(FOLLOWUP_BODIES["1week"]).toBe(
      "Hello {{1}},\n" +
        "This is a one week follow up. How are you after the treatment?\n" +
        "Kindly reply regarding the same.\n" +
        "Thanks and regards\n" +
        "The Skin Clinic Team",
    );
  });

  it("carries no double spaces or trailing whitespace", () => {
    // Two were in the text as first written. A typo is frozen the moment Meta
    // approves it - the only fix is a new template and another wait.
    for (const [kind, body] of Object.entries(FOLLOWUP_BODIES)) {
      expect(body, `${kind} has a double space`).not.toMatch(/ {2}/);
      expect(body, `${kind} has trailing whitespace on a line`).not.toMatch(/[ \t]+\n/);
      expect(body, `${kind} ends with whitespace`).toBe(body.trimEnd());
    }
  });

  it("names the templates so they appear in the clinic's own list", () => {
    // The Templates page filters on the name containing "skin" or
    // "appointment". A template named followup_24h would be created, approved,
    // and then invisible in the app that created it.
    for (const t of Object.values(FOLLOWUP_TEMPLATES)) {
      expect(t.name, `${t.name} would be hidden from the Templates page`).toMatch(/skin|appointment/);
      // Twilio's own rule for a content template name.
      expect(t.name).toMatch(/^[a-z][a-z0-9_]{0,63}$/);
    }
  });

  it("has exactly one variable, numbered 1", () => {
    for (const [kind, body] of Object.entries(FOLLOWUP_BODIES)) {
      const vars = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => m[1]);
      expect(vars, `${kind} must take exactly one variable`).toEqual(["1"]);
    }
  });
});

describe("sending outside the 24-hour window", () => {
  it("sends the approved template with the greeting as variable 1", () => {
    const params = followupTemplateParams(TO, FROM, "HX-24h-sid", "Ms. Sheren");
    expect(params.get("ContentSid")).toBe("HX-24h-sid");
    expect(params.get("ContentVariables")).toBe('{"1":"Ms. Sheren"}');
    // Free text alongside a template is not deliverable; Twilio ignores one
    // or rejects the call.
    expect(params.get("Body")).toBeNull();
    expect(params.get("To")).toBe(`whatsapp:${TO}`);
    expect(params.get("From")).toBe(`whatsapp:${FROM}`);
  });

  it("does not double the whatsapp: prefix", () => {
    const params = followupTemplateParams(TO, `whatsapp:${FROM}`, "sid", "Mr. Rahul");
    expect(params.get("From")).toBe(`whatsapp:${FROM}`);
  });
});

describe("sending inside the 24-hour window", () => {
  it("sends the same words as ordinary text, with no template", () => {
    const params = followupSessionParams(TO, FROM, "1week", "Ms. Sheren");
    expect(params.get("ContentSid")).toBeNull();
    expect(params.get("ContentVariables")).toBeNull();
    expect(params.get("Body")).toBe(followupText("1week", "Ms. Sheren"));
  });

  it("the free text and the template say the same thing", () => {
    // Only the substitution differs between the two paths.
    expect(followupText("24h", "Ms. Sheren")).toBe(
      FOLLOWUP_BODIES["24h"].replace("{{1}}", "Ms. Sheren"),
    );
    expect(followupText("24h", "Ms. Sheren")).toContain("Hello Ms. Sheren,");
    expect(followupText("24h", "Ms. Sheren")).not.toContain("{{1}}");
  });
});

describe("the service window", () => {
  const now = new Date("2026-11-06T12:00:00Z");
  const ago = (ms: number) => new Date(now.getTime() - ms).toISOString();

  it("is open under 24 hours", () => {
    expect(isWithinServiceWindow(ago(60_000), now)).toBe(true);
    expect(isWithinServiceWindow(ago(23 * 3600_000), now)).toBe(true);
  });

  it("is shut at exactly 24 hours", () => {
    // WhatsApp counts the window as UNDER 24 hours.
    expect(isWithinServiceWindow(ago(24 * 3600_000), now)).toBe(false);
  });

  it("is shut when the patient has never written, or the date is junk", () => {
    expect(isWithinServiceWindow(null, now)).toBe(false);
    expect(isWithinServiceWindow(undefined, now)).toBe(false);
    expect(isWithinServiceWindow("not a date", now)).toBe(false);
  });
});

describe("how the clinic addresses a patient", () => {
  it("uses Ms. and Mr. from gender", () => {
    expect(patientGreeting("Sheren", "", "Female")).toBe("Ms. Sheren");
    expect(patientGreeting("Rahul", "Bhat", "Male")).toBe("Mr. Rahul Bhat");
  });

  it("drops the title when gender is not recorded", () => {
    // 30 patients. A guess here is worse than no title.
    expect(patientGreeting("Sheren", "", null)).toBe("Sheren");
    expect(patientGreeting("Sheren", "", "")).toBe("Sheren");
    expect(patientGreeting("Sheren", "", "Other")).toBe("Sheren");
  });

  it("does not stack a title onto a name that already has one", () => {
    // 642 patients already carry a title, 633 of them a "Dr"/"Dr.".
    // "Ms. Dr. Krithi" is not a message this clinic should send.
    expect(patientGreeting("Dr. Krithi", "", "Female")).toBe("Dr. Krithi");
    expect(patientGreeting("Dr Deona", "Dsouza", "Female")).toBe("Dr Deona Dsouza");
  });

  it("refuses a name that is really a phone number", () => {
    // 153 patients. "Hello Ms. 9663438657," must never go out.
    expect(patientGreeting("9663438657", "", "Female")).toBe("");
    expect(patientGreeting("+91 96634 38657", "", "Male")).toBe("");
    expect(isSendableName("9663438657")).toBe(false);
  });

  it("refuses a name too short to be one", () => {
    // 8 patients have a name of one character.
    expect(patientGreeting("A", "", "Female")).toBe("");
    expect(patientGreeting("", "", "Female")).toBe("");
  });

  it("titleFromGender is the single authority, imported not re-declared", () => {
    // It used to be copy-pasted into two senders and tested in neither, so a
    // patient could be "Ms." in a booking and something else in a reschedule.
    expect(titleFromGender("Female")).toBe("Ms.");
    expect(titleFromGender("Male")).toBe("Mr.");
    expect(titleFromGender(null)).toBe("");
    for (const f of [
      "supabase/functions/send-appointment-whatsapp/index.ts",
      "supabase/functions/send-appointment-update-whatsapp/index.ts",
      "supabase/functions/send-followup-whatsapp/index.ts",
    ]) {
      const src = readFileSync(f, "utf8");
      expect(src, `${f} re-declares titleFromGender`).not.toMatch(/function titleFromGender/);
      expect(src, `${f} does not use the shared greeting module`).toContain("_shared/patient-greeting.ts");
    }
  });
});

describe("the sender refuses what it should", () => {
  const src = () => readFileSync("supabase/functions/send-followup-whatsapp/index.ts", "utf8");

  it("requires a staff member, not merely a signed-in user", () => {
    // Portal patients hold auth sessions too.
    expect(src()).toContain("requireStaff(req)");
  });

  it("reads the patient through the caller's own access, not the service role", () => {
    const text = src();
    expect(text).toContain("createClient(url, anonKey");
    expect(text).toMatch(/Authorization: req\.headers\.get\("Authorization"\)/);
  });

  it("checks the appointment belongs to that patient", () => {
    expect(src()).toMatch(/\.eq\("id", appointment_id\)\s*\n\s*\.eq\("patient_id", patient_id\)/);
  });

  it("branches on the service window rather than always sending a template", () => {
    expect(src()).toContain("isWithinServiceWindow(lastInbound?.created_at)");
    expect(src()).toContain("inWindow");
  });

  it("uses the deleted-template check rather than inlining it", () => {
    // Inlined, the condition could be turned into `if (false)` and nothing
    // here would notice - which is exactly what a mutation run showed.
    const text = src();
    expect(text).toContain("isDeletedTemplateError(result?.code, twilioSaid)");
  });

  it("explains a deleted template instead of relaying Twilio's four words", () => {
    // Twilio answers a ContentSid that no longer exists with the bare string
    // "Content was not found". That is what the front desk saw on 10 Nov,
    // after the templates were deleted - a message naming nothing and
    // suggesting nothing.
    const text = src();
    expect(text).toContain("no longer exists");
    // And it must say what to do about it.
    expect(text).toContain("Publish the app");
    // The raw Twilio wording is still used for every OTHER failure, so a real
    // Twilio problem is not hidden behind this one explanation.
    expect(text).toContain('twilioSaid || "WhatsApp could not accept the follow-up"');
  });

  it("records the send without letting a failed write fail the send", () => {
    const text = src();
    expect(text).toContain('direction: "outbound"');
    expect(text).toContain('role: "assistant"');
    expect(text).toContain("recorded: !logError");
  });
});

describe("how the delivery log labels a follow-up", () => {
  // kindOf lives in a Deno function, so the rule is asserted against its
  // source. The ordering is the whole point and a reorder is silent.
  const sync = () => readFileSync("supabase/functions/whatsapp-delivery-sync/index.ts", "utf8");

  it("labels each follow-up as itself, not as 'message'", () => {
    const text = sync();
    expect(text).toContain('return "followup_24h"');
    expect(text).toContain('return "followup_1week"');
  });

  it("claims the 24-hour follow-up BEFORE the survey rule can", () => {
    // "Looking forward to your feedback." is in the approved body, and the
    // survey rule matches any message containing "feedback" - so with the
    // lines the other way round every 24-hour follow-up is filed as a survey.
    expect(FOLLOWUP_BODIES["24h"].toLowerCase()).toContain("feedback");
    const text = sync();
    expect(text.indexOf('return "followup_24h"')).toBeLessThan(
      text.indexOf('if (b.includes("survey")'),
    );
  });

  it("matches on wording the approved bodies actually contain", () => {
    expect(FOLLOWUP_BODIES["24h"].toLowerCase()).toContain("follow-up regarding your treatment");
    expect(FOLLOWUP_BODIES["1week"].toLowerCase()).toContain("one week follow up");
  });
});

describe("recognising a template the clinic has deleted", () => {
  // Twilio's own answer for a ContentSid that is gone. Both halves matter:
  // the code is the reliable one, the wording is the one that was actually
  // seen on 10 Nov.
  it("knows Twilio's 20404", () => {
    expect(isDeletedTemplateError(20404, "")).toBe(true);
    expect(isDeletedTemplateError("20404", "anything")).toBe(true);
  });

  it("knows the wording even without the code", () => {
    expect(isDeletedTemplateError(null, "Content was not found")).toBe(true);
    expect(isDeletedTemplateError(undefined, "content was not found")).toBe(true);
  });

  it("does not blame the template for every other Twilio failure", () => {
    // 63049 is Meta's per-user marketing cap, 21211 a bad number. Neither is
    // a deleted template, and hiding them behind one explanation would send
    // somebody to publish the app over a problem publishing cannot fix.
    expect(isDeletedTemplateError(63049, "Message failed to send")).toBe(false);
    expect(isDeletedTemplateError(21211, "Invalid 'To' Phone Number")).toBe(false);
    expect(isDeletedTemplateError(null, "")).toBe(false);
    expect(isDeletedTemplateError(null, null)).toBe(false);
  });
});
