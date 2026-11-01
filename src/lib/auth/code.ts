/** Keeps only digits from a typed or pasted one-time code, capped at 6 ("123 456" → "123456"). */
export function sanitizeCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 6);
}
