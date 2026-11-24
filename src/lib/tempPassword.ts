/**
 * A temporary password somebody will actually have to type.
 *
 * The edge function used to build one as `crypto.randomUUID().slice(0, 12) +
 * "A1!"` - hex, so four bits a character, with a fixed three-character tail
 * that satisfied the strength check and told anyone who saw two of them
 * exactly how the rest were shaped.
 *
 * It never mattered, because the password was never shown to anybody: it was
 * generated, handed to Supabase, and dropped. Now that it is read off a screen
 * and pasted into a WhatsApp message, two things start to matter -
 *
 *   it must be unguessable, hence getRandomValues over a real alphabet
 *   it must survive being read aloud, hence no O/0 or l/1/I
 *
 * It is still temporary: force_password_change is set on the staff row, and
 * ChangePasswordRequired stands in front of the app until they pick their own.
 */

import { passwordProblem } from "@/lib/passwordRules";

/** No O, 0, l, I or 1 - the characters people get wrong reading them out. */
const LOWER = "abcdefghijkmnopqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
const SYMBOLS = "!@#$%&*?";
const ALPHABET = LOWER + UPPER + DIGITS + SYMBOLS;

export const TEMP_PASSWORD_LENGTH = 14;

/** A uniform index into `max`, rejecting the biased tail of the byte range. */
function randomIndex(max: number): number {
  const limit = Math.floor(256 / max) * max;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
}

function pick(from: string): string {
  return from[randomIndex(from.length)];
}

/**
 * One of each kind first, then fill, then shuffle.
 *
 * Drawing purely at random would now and then produce one with no digit,
 * which Supabase refuses - and a refusal here is an account that does not get
 * created while the admin is told nothing useful.
 */
export function generateTempPassword(length: number = TEMP_PASSWORD_LENGTH): string {
  const size = Math.max(8, Math.floor(length) || TEMP_PASSWORD_LENGTH);
  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < size) chars.push(pick(ALPHABET));
  // Fisher-Yates, so the guaranteed four do not always sit at the front.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

/** Whether a generated password would pass the rules every human password must. */
export function tempPasswordIsValid(password: string): boolean {
  return passwordProblem(password) === null;
}

export const SIGN_IN_URL = "https://clinic.quickapp.ai";

/**
 * What the admin pastes into WhatsApp.
 *
 * The password alone is no use to the person receiving it - they need to know
 * where to put it and which email it belongs to. Copying the whole message is
 * what the portal access code panel already does, for the same reason.
 */
export function credentialsMessage(input: {
  name?: string | null;
  email: string;
  password: string;
}): string {
  const greeting = input.name?.trim() ? `Hello ${input.name.trim()},\n\n` : "";
  return (
    `${greeting}Your The Skin Clinic app login:\n` +
    `${SIGN_IN_URL}\n\n` +
    `Email: ${input.email}\n` +
    `Temporary password: ${input.password}\n\n` +
    `You will be asked to choose your own password the first time you sign in.`
  );
}
