const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Приводит e-mail к каноническому виду (trim + lowercase).
 * Возвращает null, если адрес не похож на валидный.
 */
export function normalizeEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  return email;
}
