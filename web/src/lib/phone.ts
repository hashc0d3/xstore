/** Полный российский номер: 10 цифр после +7 или 8. */
export function isCompleteRuPhone(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  if (!digits) return false;
  const national = digits.startsWith("7") || digits.startsWith("8") ? digits.slice(1) : digits;
  return national.length === 10;
}
