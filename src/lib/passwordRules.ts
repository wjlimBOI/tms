// Client-side mirror of the password strength rules enforced server-side
// (src/lib/validation.ts's passwordValidation and the manual checks in
// api/user/change-password) — stricter than passwordValidation's 12-char
// minimum is fine (15 still passes server-side), keeps one set of UX-facing
// rules shared across every password-entry form in the app.
export function validatePassword(password: string) {
  const errors: string[] = [];
  if (password.length < 15) errors.push("At least 15 characters");
  if (password.length > 64) errors.push("Maximum 64 characters");
  if (!/[A-Z]/.test(password)) errors.push("One uppercase letter (A–Z)");
  if (!/[a-z]/.test(password)) errors.push("One lowercase letter (a–z)");
  if (!/\d/.test(password)) errors.push("One digit (0–9)");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("One special character (e.g., !@#$%^&*)");
  return {
    isValid: errors.length === 0,
    errors,
    score: errors.length === 0 ? 3 : errors.length <= 2 ? 1 : 0,
  };
}
