/**
 * One definition of an acceptable password.
 *
 * Supabase rejects weak passwords server-side, so a form that accepts less than
 * the server does just turns a clear client-side message into a confusing one
 * from the API. The Create User dialog was tightened to eight characters with
 * mixed case, a digit and a symbol; the password-reset dialog and the
 * first-login screen have to agree with it, or a user is told six is fine and
 * then refused.
 */
export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT =
  "At least 8 characters, with an uppercase and a lowercase letter, a number and a symbol.";

/** The problem with this password, or null when there is none. */
export function passwordProblem(password: string, confirm?: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
  }
  const strong =
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password) &&
    /[^A-Za-z0-9]/.test(password);
  if (!strong) return "Password must include uppercase, lowercase, a number and a symbol";
  if (confirm !== undefined && password !== confirm) return "Passwords do not match";
  return null;
}
