export type PasswordCheck = {
  valid: boolean;
  errors: string[];
};

export function checkPasswordPolicy(password: string): PasswordCheck {
  const errors: string[] = [];
  if (password.length < 12) errors.push("Use at least 12 characters.");
  if (password.length > 128) errors.push("Use no more than 128 characters.");
  if (!/[a-z]/.test(password)) errors.push("Add a lowercase letter.");
  if (!/[A-Z]/.test(password)) errors.push("Add an uppercase letter.");
  if (!/\d/.test(password)) errors.push("Add a number.");
  if (!/[^A-Za-z0-9]/.test(password)) errors.push("Add a symbol.");
  return { valid: errors.length === 0, errors };
}
