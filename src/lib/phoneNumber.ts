export function normalizeNigerianPhone(value: string): string | null {
  const digits = value.trim().replace(/[\s().-]/g, "");
  const normalized = digits.startsWith("+") ? digits.slice(1) : digits;
  if (!/^234\d{10}$/.test(normalized)) {
    if (!/^0\d{10}$/.test(normalized)) return null;
    const local = normalized.slice(1);
    if (!/^[789]\d{9}$/.test(local)) return null;
    return `+234${local}`;
  }
  const subscriber = normalized.slice(3);
  return /^[789]\d{9}$/.test(subscriber) ? `+234${subscriber}` : null;
}

export type PhoneCountry = {
  code: string;
  name: string;
  dialCode: string;
  flag: string;
};

/**
 * A deliberately small, high-signal country catalogue for the onboarding
 * selector. The stored value is always the E.164-style value, while the
 * visible field remains comfortable for local numbers.
 */
export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: "US", name: "United States", dialCode: "+1", flag: "🇺🇸" },
  { code: "CA", name: "Canada", dialCode: "+1", flag: "🇨🇦" },
  { code: "GB", name: "United Kingdom", dialCode: "+44", flag: "🇬🇧" },
  { code: "NG", name: "Nigeria", dialCode: "+234", flag: "🇳🇬" },
  { code: "GH", name: "Ghana", dialCode: "+233", flag: "🇬🇭" },
  { code: "KE", name: "Kenya", dialCode: "+254", flag: "🇰🇪" },
  { code: "ZA", name: "South Africa", dialCode: "+27", flag: "🇿🇦" },
  { code: "UG", name: "Uganda", dialCode: "+256", flag: "🇺🇬" },
  { code: "TZ", name: "Tanzania", dialCode: "+255", flag: "🇹🇿" },
  { code: "RW", name: "Rwanda", dialCode: "+250", flag: "🇷🇼" },
  { code: "IN", name: "India", dialCode: "+91", flag: "🇮🇳" },
  { code: "AE", name: "United Arab Emirates", dialCode: "+971", flag: "🇦🇪" },
  { code: "SA", name: "Saudi Arabia", dialCode: "+966", flag: "🇸🇦" },
  { code: "DE", name: "Germany", dialCode: "+49", flag: "🇩🇪" },
  { code: "FR", name: "France", dialCode: "+33", flag: "🇫🇷" },
  { code: "NL", name: "Netherlands", dialCode: "+31", flag: "🇳🇱" },
  { code: "AU", name: "Australia", dialCode: "+61", flag: "🇦🇺" },
  { code: "NZ", name: "New Zealand", dialCode: "+64", flag: "🇳🇿" },
  { code: "SG", name: "Singapore", dialCode: "+65", flag: "🇸🇬" },
  { code: "JP", name: "Japan", dialCode: "+81", flag: "🇯🇵" },
  { code: "CN", name: "China", dialCode: "+86", flag: "🇨🇳" },
  { code: "BR", name: "Brazil", dialCode: "+55", flag: "🇧🇷" },
  { code: "MX", name: "Mexico", dialCode: "+52", flag: "🇲🇽" },
] as const;

function digitsOnly(value: string): string {
  return value.replace(/[\s().-]/g, "");
}

/** Normalize a local or international number against the selected dial code. */
export function normalizeInternationalPhone(value: string, countryDialCode?: string): string | null {
  const compact = digitsOnly(value.trim());
  if (!compact || !/^\+?\d+$/.test(compact)) return null;
  if (!countryDialCode && !compact.startsWith("+") && !compact.startsWith("00")) return null;

  let digits = compact.startsWith("+") ? compact.slice(1) : compact;
  if (digits.startsWith("00")) digits = digits.slice(2);

  const dialCode = countryDialCode?.replace(/\D/g, "");
  if (dialCode) {
    if (dialCode === "234") return normalizeNigerianPhone(value);
    const subscriber = digits.startsWith(dialCode) ? digits.slice(dialCode.length) : digits.replace(/^0+/, "");
    if (!subscriber) return null;
    digits = dialCode + subscriber;
  }

  return /^\d{7,15}$/.test(digits) ? `+${digits}` : null;
}

export function countryForPhone(value: string | null | undefined): PhoneCountry | null {
  if (!value) return null;
  const digits = digitsOnly(value).replace(/^\+/, "").replace(/^00/, "");
  return PHONE_COUNTRIES.find((country) => digits.startsWith(country.dialCode.slice(1))) ?? null;
}

export function localPhoneForCountry(value: string | null | undefined, country: PhoneCountry | null): string {
  if (!value || !country) return value ?? "";
  const digits = digitsOnly(value).replace(/^\+/, "").replace(/^00/, "");
  if (!digits.startsWith(country.dialCode.slice(1))) return value;
  const subscriber = digits.slice(country.dialCode.length - 1);
  return country.code === "NG" ? `0${subscriber}` : subscriber;
}

export function detectPhoneCountry(): string {
  if (typeof navigator === "undefined") return "";
  const region = /-(\w{2})(?:-|$)/.exec(navigator.language)?.[1]?.toUpperCase();
  return PHONE_COUNTRIES.find((country) => country.code === region)?.code ?? "";
}
