export const BLOCKED_COUNTRIES = new Set(["RU", "IR", "KP", "NL", "DK"]);

export function normalizeCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.trim().toUpperCase();
}

export function isBlockedCountry(countryCode: string | null | undefined): boolean {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return false;
  return BLOCKED_COUNTRIES.has(normalized);
}
