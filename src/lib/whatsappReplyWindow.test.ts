import { describe, it, expect } from "vitest";
import { replyWindow, REPLY_WINDOW_HOURS } from "./whatsappReplyWindow";

const now = new Date("2026-10-13T12:00:00Z");
const hoursAgo = (h: number) => new Date(now.getTime() - h * 60 * 60 * 1000).toISOString();

describe("replyWindow", () => {
  it("is open while the patient wrote within the day", () => {
    expect(replyWindow(hoursAgo(1), now)).toEqual({ open: true, note: "" });
    expect(replyWindow(hoursAgo(23.5), now)).toEqual({ open: true, note: "" });
  });

  it("is shut once their message is a day old", () => {
    const shut = replyWindow(hoursAgo(25), now);
    expect(shut.open).toBe(false);
    expect(shut.note).toContain("24 hours");
  });

  it("counts exactly twenty-four hours as shut", () => {
    // WhatsApp's window is under 24 hours, so the boundary is not inside it.
    expect(replyWindow(hoursAgo(REPLY_WINDOW_HOURS), now).open).toBe(false);
  });

  it("says something different about a number that has never written in", () => {
    const never = replyWindow(null, now);
    expect(never.open).toBe(false);
    expect(never.note).toContain("never written");
    expect(replyWindow(undefined, now).note).toBe(never.note);
    expect(replyWindow("", now).note).toBe(never.note);
  });

  it("treats a date it cannot read as no message at all, never as an open window", () => {
    const broken = replyWindow("not a date", now);
    expect(broken.open).toBe(false);
    expect(broken.note).toContain("never written");
  });

  it("takes a Date or a timestamp as readily as a string", () => {
    expect(replyWindow(new Date(hoursAgo(2)), now).open).toBe(true);
    expect(replyWindow(new Date(hoursAgo(2)).getTime(), now).open).toBe(true);
  });
});

describe("what a closed window tells the clinic", () => {
  const now = new Date("2026-10-15T12:00:00Z");

  it("names WhatsApp's rule, not the app, and says what to do instead", () => {
    // Front desk read "replies are closed" as a fault in the app and asked why
    // they could not send a follow-up reminder. Both closed notes now say whose
    // rule it is and leave them a way to reach the patient.
    for (const note of [replyWindow(null, now).note, replyWindow(new Date("2026-10-10T12:00:00Z"), now).note]) {
      expect(note).toContain("WhatsApp only delivers");
      expect(note).toContain("phone");
    }
  });

  it("does not tell the clinic to ring itself", () => {
    // This note is only ever read by the front desk. An earlier version gave
    // the clinic's own numbers, which is advice for a patient and useless to
    // the staff reading it - they are the clinic. The patient's number is at
    // the top of the thread they are looking at.
    for (const note of [replyWindow(null, now).note, replyWindow(new Date("2026-10-10T12:00:00Z"), now).note]) {
      expect(note).not.toContain("96201 23030");
      expect(note).not.toContain("63607 53030");
    }
  });

  it("says nothing at all while the window is open", () => {
    expect(replyWindow(new Date("2026-10-15T11:00:00Z"), now)).toEqual({ open: true, note: "" });
  });
});
