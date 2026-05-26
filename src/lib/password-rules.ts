// Shared password complexity rules. Applied wherever a user picks a
// new password — register, /forgot reset, /profile change — and used
// to render live "you've met this rule" indicators on each form.
//
// Login is intentionally NOT gated on these rules: pre-existing users
// may have set weaker passwords before the policy tightened and we
// don't want to lock them out. The next time they change it, they'll
// be held to the new rules.

export type PasswordRuleCheck = {
  length: boolean;
  upper: boolean;
  digit: boolean;
};

export function checkPasswordRules(pw: string): PasswordRuleCheck {
  return {
    length: pw.length >= 8 && pw.length <= 72,
    upper: /[A-Z]/.test(pw),
    digit: /[0-9]/.test(pw),
  };
}

export function passwordMeetsRules(pw: string): boolean {
  const c = checkPasswordRules(pw);
  return c.length && c.upper && c.digit;
}

export const PASSWORD_RULES_COPY = {
  length: "Between 8 and 72 characters",
  upper: "Includes a capital letter (A–Z)",
  digit: "Includes a number (0–9)",
} as const;

/** Human-readable summary used in form-error pills. */
export const PASSWORD_RULES_SUMMARY =
  "Password must be 8–72 characters, with at least one capital letter and one number.";
