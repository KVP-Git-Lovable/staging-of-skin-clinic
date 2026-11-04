import { describe, it, expect } from "vitest";
import { GOOGLE_REVIEW_LINK, GOOGLE_REVIEW_LINK_LEGACY, GOOGLE_REVIEW_MESSAGE, isReviewRequestMessage, reviewAlreadySentNotice, reviewContactNotice, reviewRequestState, whatsappShareUrl } from "./googleReview";

describe("GOOGLE_REVIEW_MESSAGE", () => {
  /**
   * The clinic wrote this and it is also the body of the
   * google_review_request template. These assertions exist so that editing one
   * without the other is caught here rather than by a patient receiving the
   * wrong link.
   */
  it("keeps the clinic's review link exactly", () => {
    expect(GOOGLE_REVIEW_MESSAGE).toContain(GOOGLE_REVIEW_LINK);
    // Changed 28 Oct 2026: the old link made patients sign in to Google when
    // they tapped it from WhatsApp. This one was tested on a phone and opens
    // signed in, on the review box rather than the clinic's listing.
    expect(GOOGLE_REVIEW_LINK).toBe(
      "https://search.google.com/local/writereview?placeid=ChIJL-NphEdaozsRyFHNoxiLDVA",
    );
  });

  it("keeps the address and the phone number the clinic gave", () => {
    expect(GOOGLE_REVIEW_MESSAGE).toContain("The Skin Clinic");
    expect(GOOGLE_REVIEW_MESSAGE).toContain("Vyasa Rao Road, Kadri Kambla Rd, Mangalore, Karnataka 575002");
    expect(GOOGLE_REVIEW_MESSAGE).toContain("063607 53030");
  });

  it("opens the way they wrote it", () => {
    expect(GOOGLE_REVIEW_MESSAGE.startsWith("It has been a great pleasure serving you")).toBe(true);
  });

  it("carries no placeholder anybody has to fill in", () => {
    // A body with no variables is also the easiest kind for Meta to approve.
    expect(GOOGLE_REVIEW_MESSAGE).not.toMatch(/\{\{.*?\}\}/);
  });
});

describe("whatsappShareUrl", () => {
  it("opens a chat with a ten-digit mobile, country code added", () => {
    // 9606342269 is how the clinic's numbers are stored.
    expect(whatsappShareUrl("9606342269")).toContain("https://web.whatsapp.com/send?phone=919606342269&text=");
  });

  it("does not add the country code twice", () => {
    expect(whatsappShareUrl("919606342269")).toContain("phone=919606342269&");
    expect(whatsappShareUrl("+91 96063 42269")).toContain("phone=919606342269&");
  });

  it("survives the punctuation numbers get typed with", () => {
    expect(whatsappShareUrl("096063-42269")).toContain("phone=919606342269&");
    expect(whatsappShareUrl("(96063) 42269")).toContain("phone=919606342269&");
  });

  it("escapes the message so the link and the line breaks arrive intact", () => {
    const url = whatsappShareUrl("9606342269") ?? "";
    expect(url).toContain(encodeURIComponent(GOOGLE_REVIEW_LINK));
    // Newlines must be escaped, not left raw in a URL.
    expect(url).not.toContain("\n");
    expect(url).toContain("%0A");
    // And the whole thing must decode back to exactly what was written.
    expect(decodeURIComponent(url.split("&text=")[1])).toBe(GOOGLE_REVIEW_MESSAGE);
  });

  it("carries a message of its own when given one", () => {
    const url = whatsappShareUrl("9606342269", "Hello there") ?? "";
    expect(url).toContain("text=Hello%20there");
  });

  it("goes straight to WhatsApp Web, never through wa.me or api.whatsapp.com", () => {
    // This is the bug. wa.me is a redirector: it forwards to
    // api.whatsapp.com/send, which shows a "Continue to chat" page first -
    // an extra click on every request, and the host that produced
    // "api.whatsapp.com is blocked / ERR_BLOCKED_BY_RESPONSE" when the
    // button was pressed. Neither host may come back.
    const url = whatsappShareUrl("9606342269") ?? "";
    expect(url).toContain("https://web.whatsapp.com/send");
    expect(url).not.toContain("wa.me");
    expect(url).not.toContain("api.whatsapp.com");
  });

  it("puts the number in the phone parameter, where /send expects it", () => {
    // web.whatsapp.com/send reads ?phone=, not a number in the path. Keeping
    // the path form would open WhatsApp Web on no chat at all.
    const url = new URL(whatsappShareUrl("9606342269") ?? "");
    expect(url.hostname).toBe("web.whatsapp.com");
    expect(url.pathname).toBe("/send");
    expect(url.searchParams.get("phone")).toBe("919606342269");
    expect(url.searchParams.get("text")).toBe(GOOGLE_REVIEW_MESSAGE);
  });

  it("has nowhere to send a patient with no usable number", () => {
    // The button is disabled on this, rather than opening WhatsApp on nothing.
    expect(whatsappShareUrl("")).toBeNull();
    expect(whatsappShareUrl(null)).toBeNull();
    expect(whatsappShareUrl(undefined)).toBeNull();
    expect(whatsappShareUrl("12345")).toBeNull();
    expect(whatsappShareUrl("not a phone")).toBeNull();
  });
});

describe("reviewRequestState", () => {
  it("is ready to send when the patient has a number", () => {
    const state = reviewRequestState("9606342269");
    expect(state.enabled).toBe(true);
    expect(state.url).toContain("web.whatsapp.com/send?phone=919606342269");
    expect(state.reason).toBe("");
  });

  it("is disabled, with a reason, when there is nowhere to send it", () => {
    for (const bad of ["", null, undefined, "12345", "not a phone"]) {
      const state = reviewRequestState(bad as string | null | undefined);
      expect(state.enabled).toBe(false);
      expect(state.url).toBeNull();
      // The reason is shown on screen, so it has to actually say something.
      expect(state.reason.length).toBeGreaterThan(0);
    }
  });
});

describe("staying in step with the approved template", () => {
  /**
   * Twilio content SID HXf1521e98ec4adb966dd73ac571050e29, approved 23 Oct
   * 2026. Meta approves a BODY, not a name - so if this text and the template
   * drift apart, the app sends one thing and WhatsApp delivers another, and
   * the template has to be resubmitted and re-approved to fix it.
   */
  it("matches the approved body exactly", () => {
    // The clinic corrected "serving you ." to "serving you." when they created
    // the template; the app follows the approved wording, not the other way.
    expect(GOOGLE_REVIEW_MESSAGE).toContain("great pleasure serving you. Your feedback");
    expect(GOOGLE_REVIEW_MESSAGE).not.toContain("serving you .");
  });

  it("is still the length the template was submitted at", () => {
    // 302 until the link changed; only the URL is longer, nothing was reworded.
    expect(GOOGLE_REVIEW_MESSAGE).toHaveLength(358);
  });
});

describe("noticing a review request that already went", () => {
  it("recognises the template body by its link", () => {
    expect(isReviewRequestMessage(GOOGLE_REVIEW_MESSAGE)).toBe(true);
  });

  it("recognises what the sender records when Twilio returns no body", () => {
    // The common case for a template send, not the rare one.
    expect(
      isReviewRequestMessage("Google review request sent using the approved clinic template."),
    ).toBe(true);
  });

  it("does not mistake the clinic's other messages for one", () => {
    expect(isReviewRequestMessage("Hello Ms. Divya,\n\nYou have an appointment on...")).toBe(false);
    expect(isReviewRequestMessage("Thanks for confirming, Ravi! 😊 See you soon")).toBe(false);
    expect(isReviewRequestMessage("To modify or cancel your booking, please call us")).toBe(false);
  });

  it("treats nothing as nothing", () => {
    expect(isReviewRequestMessage("")).toBe(false);
    expect(isReviewRequestMessage("   ")).toBe(false);
    expect(isReviewRequestMessage(null)).toBe(false);
    expect(isReviewRequestMessage(undefined)).toBe(false);
  });
});

describe("reviewAlreadySentNotice", () => {
  const now = new Date(2026, 9, 23, 18, 0);

  it("says today, with the time, for one sent earlier the same day", () => {
    const notice = reviewAlreadySentNotice(new Date(2026, 9, 23, 17, 5), now);
    expect(notice).toContain("today");
    expect(notice).toMatch(/5:05/);
  });

  it("carries the date when it was not today", () => {
    const notice = reviewAlreadySentNotice(new Date(2026, 9, 21, 10, 30), now);
    expect(notice).not.toContain("today");
    expect(notice).toContain("21");
    expect(notice).toContain("2026");
  });

  it("says nothing when none has been sent", () => {
    expect(reviewAlreadySentNotice(null, now)).toBe("");
    expect(reviewAlreadySentNotice(undefined, now)).toBe("");
    expect(reviewAlreadySentNotice("not a date", now)).toBe("");
  });

  it("accepts the timestamp string the database returns", () => {
    expect(reviewAlreadySentNotice(new Date(2026, 9, 23, 17, 5).toISOString(), now)).toContain("today");
  });
});

/**
 * Nine review requests had already gone out carrying the old link when it
 * changed. The "already sent" notice finds a previous send by looking for the
 * link in the stored message, and that notice is the only thing stopping a
 * patient being asked twice - which had already happened to one of them.
 */
describe("recognising a request sent before the link changed", () => {
  const sentWithOldLink = `It has been a great pleasure serving you. Your feedback really matter to us.
Click on the link: ${GOOGLE_REVIEW_LINK_LEGACY}

The Skin Clinic`;

  it("still counts an old-link message as a review request", () => {
    expect(isReviewRequestMessage(sentWithOldLink)).toBe(true);
  });

  it("counts one sent with the new link too", () => {
    expect(isReviewRequestMessage(GOOGLE_REVIEW_MESSAGE)).toBe(true);
  });

  it("keeps the two links apart, so the legacy one is not quietly reused", () => {
    expect(GOOGLE_REVIEW_LINK).not.toBe(GOOGLE_REVIEW_LINK_LEGACY);
    expect(GOOGLE_REVIEW_MESSAGE).not.toContain(GOOGLE_REVIEW_LINK_LEGACY);
  });

  it("is still not fooled by an ordinary message", () => {
    expect(isReviewRequestMessage("Your appointment is confirmed for tomorrow")).toBe(false);
    expect(isReviewRequestMessage("")).toBe(false);
  });
});

/**
 * The button no longer sends through the app - it opens the staff member's
 * own WhatsApp with the message typed, because the body approved at Meta
 * still carries the old link that makes patients sign in to Google.
 *
 * That means the "already sent" notice has two sources that say different
 * things, and the wording has to tell them apart: a send the app made, and a
 * link a staff member opened. These exist because the notice is the only
 * thing standing between a patient and being asked twice, which has already
 * happened to one of them.
 */
describe("reviewContactNotice", () => {
  const now = new Date(2026, 10, 2, 18, 0);
  const todayMorning = new Date(2026, 10, 2, 9, 15);
  const todayAfternoon = new Date(2026, 10, 2, 15, 42);
  const lastWeek = new Date(2026, 9, 26, 11, 0);

  it("says nothing when the patient has never been asked", () => {
    expect(reviewContactNotice(null, null, now)).toBe("");
    expect(reviewContactNotice(undefined, undefined, now)).toBe("");
  });

  it("reports a send the app made as sent", () => {
    const notice = reviewContactNotice(todayAfternoon, null, now);
    expect(notice).toContain("Already sent");
    expect(notice).toContain("today");
  });

  it("reports a link a staff member opened as opened, NOT as sent", () => {
    // We cannot see whether they pressed send in WhatsApp, so claiming the
    // patient was sent anything would be a lie the clinic acts on.
    const notice = reviewContactNotice(null, todayAfternoon, now);
    expect(notice).toContain("Review link opened");
    expect(notice).not.toContain("Already sent");
    expect(notice).toContain("today");
  });

  it("reports whichever happened later, when both did", () => {
    expect(reviewContactNotice(lastWeek, todayMorning, now)).toContain("Review link opened");
    expect(reviewContactNotice(todayMorning, lastWeek, now)).toContain("Already sent");
  });

  it("gives a tie to the send, which is the thing we actually know happened", () => {
    expect(reviewContactNotice(todayMorning, todayMorning, now)).toContain("Already sent");
  });

  it("carries the date when it was not today", () => {
    const notice = reviewContactNotice(null, lastWeek, now);
    expect(notice).not.toContain("today");
    expect(notice).toContain("26");
    expect(notice).toContain("2026");
  });

  it("accepts the timestamp strings the database returns", () => {
    expect(reviewContactNotice(null, todayAfternoon.toISOString(), now)).toContain("Review link opened today");
    expect(reviewContactNotice(todayAfternoon.toISOString(), null, now)).toContain("Already sent today");
  });

  it("ignores a timestamp it cannot read rather than claiming contact", () => {
    expect(reviewContactNotice("not a date", null, now)).toBe("");
    expect(reviewContactNotice(null, "not a date", now)).toBe("");
    // One unreadable and one good: the good one still has to show.
    expect(reviewContactNotice("not a date", todayAfternoon, now)).toContain("Review link opened");
  });

  it("still words a plain send exactly as it always did", () => {
    // reviewAlreadySentNotice is unchanged behaviour shared with this one -
    // if refactoring moved the wording, the whole Feedback tab reads wrong.
    expect(reviewContactNotice(todayAfternoon, null, now))
      .toBe(reviewAlreadySentNotice(todayAfternoon, now));
  });
});
