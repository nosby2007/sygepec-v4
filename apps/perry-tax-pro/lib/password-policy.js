// Password rules shared by the browser (live hints) and the server (the real check).
// The server also refuses passwords found in known data breaches (lib/breached-password.js).

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 128;

const COMMON = ["password", "123456", "qwerty", "letmein", "welcome", "admin", "iloveyou", "monkey", "dragon", "abc123", "innovacare", "perrytax"];

// 0 (empty) to 4 (strong). Only a hint for the person typing; the rules below decide.
export function passwordStrength(pw) {
  if (!pw) return 0;
  let s = 0;
  if (pw.length >= PASSWORD_MIN) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw) || pw.length >= 16) s++;
  return Math.max(1, s);
}

export const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"];

// Returns a list of problems in plain words; empty when the password is acceptable.
// `context` holds the person's own details, which must not make up the password.
export function passwordProblems(pw, context = {}) {
  if (typeof pw !== "string" || !pw) return ["Choose a password."];
  const problems = [];
  if (pw.length < PASSWORD_MIN) problems.push(`Use at least ${PASSWORD_MIN} characters.`);
  if (pw.length > PASSWORD_MAX) problems.push(`Use at most ${PASSWORD_MAX} characters.`);
  if (/^(.)\1+$/.test(pw)) problems.push("Do not repeat one character.");
  const lower = pw.toLowerCase();
  if (COMMON.some((w) => lower.replace(/[^a-z0-9]/g, "").includes(w))) problems.push("Avoid common words such as \"password\" or \"123456\".");
  const personal = [String(context.email || "").split("@")[0], ...String(context.name || "").split(/\s+/), context.businessName]
    .map((v) => String(v || "").toLowerCase().replace(/[^a-z0-9]/g, ""))
    .filter((v) => v.length >= 4);
  if (personal.some((v) => lower.replace(/[^a-z0-9]/g, "").includes(v))) problems.push("Do not use your name, email or business name in the password.");
  if (passwordStrength(pw) < 3 && pw.length < 16) problems.push("Mix upper and lower case letters, numbers or symbols, or use 16+ characters.");
  return problems;
}
