export function normalizeEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || parts[0].length === 0) return null;

  const domain = parts[1];
  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) return null;
  if (/\s/.test(email)) return null;

  return email;
}
