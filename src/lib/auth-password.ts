/**
 * The app allows passwords of 5+ characters (owner's choice), but Supabase Auth
 * rejects anything shorter than 6. Short passwords get a fixed suffix before they
 * reach Supabase — the same transform on create, change and sign-in, so the user
 * only ever types their own 5 characters. Passwords of 6+ pass through untouched,
 * so every existing password keeps working.
 */
export const MIN_PASSWORD = 5;
const SUPABASE_MIN = 6;
const SHORT_SUFFIX = "⁣weblly";

export function toAuthPassword(password: string): string {
  return password.length < SUPABASE_MIN ? password + SHORT_SUFFIX : password;
}
