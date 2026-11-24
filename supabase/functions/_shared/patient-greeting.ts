/**
 * How the clinic addresses a patient in a WhatsApp message.
 *
 * ── Why this is one file ──
 *
 * titleFromGender was copy-pasted into send-appointment-whatsapp and
 * send-appointment-update-whatsapp, identical in both and tested in neither.
 * The same patient gets a booking confirmation from one and a reschedule from
 * the other, so the two drifting apart means being "Ms." on Monday and
 * "Mrs." on Tuesday. whatsapp-delivery-sync even reads the title back OUT of
 * a message body to tell apart two family members sharing a phone, so the
 * wording is load-bearing in a third place.
 *
 * There is no title column on `patients` - only `gender` - so the title is
 * derived, and it is derived here.
 */

/**
 * Mr. / Ms. from a gender, or "" when there is nothing to go on.
 *
 * "Ms." rather than "Miss" on purpose: it carries no claim about whether
 * somebody is married, and 18,867 of this clinic's patients are female, so the
 * wrong guess is not a rare event. 30 patients have no gender recorded and
 * correctly get no title at all.
 */
export function titleFromGender(gender?: string | null): string {
  if (!gender) return "";
  const g = gender.toLowerCase();
  if (g.startsWith("m")) return "Mr.";
  if (g.startsWith("f")) return "Ms.";
  return "";
}

/**
 * Is this a name the clinic can put in a message?
 *
 * 153 patients have a phone number stored where their name should be and 8
 * have a name of a single character. "Hello Ms. 9663438657" is not a message
 * this clinic should send, so the caller is expected to check this first and
 * refuse rather than send something embarrassing.
 *
 * Mirrors isPhoneLikeName/hasRealName in src/lib/patientName.ts. Deno cannot
 * import from the browser bundle, which is why this is restated rather than
 * imported - the same reason the portal functions restate phoneKey.
 */
export function isSendableName(name: string | null | undefined): boolean {
  const text = String(name ?? "").trim();
  if (text.length < 2) return false;
  // Must contain a Latin letter, which is what refuses a name that is really a
  // phone number: "9663438657" has none. 0 patients have a name in a non-Latin
  // script, so nobody is refused on that account today.
  return /[a-z]/i.test(text);
}

/**
 * The whole greeting, as one string.
 *
 * It is one string because the WhatsApp templates take it as a single
 * variable - `Hello {{1}},` rather than `Hello Miss {{1}},`. That keeps the
 * title a decision this file makes, so changing it later is a code change
 * rather than a new template and another wait for Meta's approval.
 *
 * Returns "" when the name is not sendable, so a caller that forgets to check
 * sends nothing rather than sending rubbish. Twilio rejects an empty
 * substitution outright, which is the failure we want over a delivered
 * "Hello Ms. ,".
 */
export function patientGreeting(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  gender: string | null | undefined,
): string {
  const name = [firstName, lastName].map((p) => String(p ?? "").trim()).filter(Boolean).join(" ");
  if (!isSendableName(name)) return "";
  const title = titleFromGender(gender);
  // Already carries one - 642 patients do, 633 of them a "Dr"/"Dr." - so
  // adding another would produce "Ms. Dr. Krithi".
  if (/^(dr|mr|mrs|ms|miss|prof)\.?\s/i.test(name)) return name;
  return title ? `${title} ${name}` : name;
}
