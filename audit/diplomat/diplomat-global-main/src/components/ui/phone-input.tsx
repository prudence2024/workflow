/**
 * International Phone Input — powered by react-phone-number-input (libphonenumber-js).
 *
 * Features:
 * - All countries with searchable dropdown, flags, dial codes
 * - Nigeria as default
 * - E.164 normalization on save
 * - Formatting while typing (country-aware)
 * - Country-aware validation via libphonenumber metadata
 * - Server-side independent validation
 * - Phone lock support: when locked to Nigeria, selector hidden + server rejects foreign
 */

import { useCallback, useState } from "react";
import PhoneInputBase from "react-phone-number-input";
import flags from "react-phone-number-input/flags";
import type { Country } from "react-phone-number-input";
import "react-phone-number-input/style.css";
import { cn } from "@/lib/utils";

const LOCKED_COUNTRY: Country = "NG" as Country;

export interface PhoneInputProps {
  value: string;
  onChange: (e164: string) => void;
  defaultCountry?: string;
  /** When true, country selector is locked to Nigeria (NG) */
  countryLocked?: boolean;
  className?: string;
  required?: boolean;
  placeholder?: string;
  id?: string;
  name?: string;
  disabled?: boolean;
}

/**
 * International phone input with libphonenumber-backed metadata.
 * All countries available via searchable dropdown.
 * Default country: Nigeria (NG).
 */
export function PhoneInput({
  value,
  onChange,
  defaultCountry = "NG",
  countryLocked = false,
  className,
  required,
  placeholder,
  id,
  name,
  disabled,
}: PhoneInputProps) {
  const handleChange = useCallback(
    (val: string | undefined) => {
      onChange(val || "");
    },
    [onChange],
  );

  // Accessible name: use the provided id/label when present; otherwise give
  // the underlying tel input an aria-label so the control is never unnamed
  // (web-design-guidelines: form controls need a label or aria-label).
  const numberAriaLabel = id ? undefined : placeholder || "Phone number";
  return (
    <PhoneInputBase
      international
      countryCallingCodeEditable={false}
      defaultCountry={countryLocked ? LOCKED_COUNTRY : (defaultCountry as Country)}
      country={countryLocked ? LOCKED_COUNTRY : undefined}
      flags={flags}
      value={value || undefined}
      onChange={handleChange}
      id={id}
      name={name}
      disabled={disabled}
      required={required}
      placeholder={placeholder || "Enter phone number"}
      aria-label={numberAriaLabel}
      className={cn("PhoneInput", countryLocked && "PhoneInput--locked", className)}
      numberInputProps={{
        "aria-label": numberAriaLabel,
        className: cn(
          "min-h-12 flex-1 rounded-r-xl border border-l-0 border-border bg-surface px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-brand focus:ring-2 focus:ring-brand/15",
        ),
      }}
      countrySelectProps={{
        "aria-label": "Country calling code",
        className: cn(
          "min-h-12 cursor-pointer rounded-l-xl border border-border bg-surface px-3 text-sm transition hover:bg-muted/50 focus:outline-none focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/15",
        ),
      }}
    />
  );
}

/**
 * Validate a phone number using libphonenumber-js.
 * Returns null if valid, error message if invalid.
 * Optional — empty/missing values pass (phone may be optional).
 */
export function validatePhone(value: string, defaultCountry: string = "NG"): string | null {
  if (!value || value.trim() === "") return null; // optional field
  try {
    const { parsePhoneNumberWithError } = require("libphonenumber-js");
    const parsed = parsePhoneNumberWithError(value, defaultCountry as any);
    if (!parsed) return "Invalid phone number";
    if (!parsed.isValid()) return "Phone number is not valid for the selected country";
    return null;
  } catch {
    return "Invalid phone number format";
  }
}

/**
 * Validate a phone number and ensure it is Nigerian (for phone lock mode).
 * Returns null if valid, error message if not Nigerian.
 */
export function validateNigerianPhone(value: string): string | null {
  if (!value || value.trim() === "") return null;
  try {
    const { parsePhoneNumberWithError } = require("libphonenumber-js");
    const parsed = parsePhoneNumberWithError(value, "NG" as any);
    if (!parsed) return "Invalid phone number";
    if (!parsed.isValid()) return "Phone number is not a valid Nigerian number";
    if (parsed.country && parsed.country !== "NG") {
      return "Phone number must be a Nigerian number";
    }
    return null;
  } catch {
    return "Invalid Nigerian phone number format";
  }
}

/**
 * Server-side independent validation of an E.164 phone number.
 * Use this in server functions to validate phone payloads.
 * Returns true if valid, false otherwise.
 */
export function isValidE164Phone(value: string, country?: string): boolean {
  if (!value || value.trim() === "") return true; // optional
  try {
    const { parsePhoneNumberFromString } = require("libphonenumber-js");
    const parsed = parsePhoneNumberFromString(value, country as any);
    if (!parsed) return false;
    return parsed.isValid() && parsed.number === value;
  } catch {
    return false;
  }
}

/**
 * Server-side validation: reject non-Nigerian numbers.
 * Returns true if the number is a valid Nigerian E.164 number.
 */
export function isNigerianPhone(value: string): boolean {
  if (!value || value.trim() === "") return true;
  try {
    const { parsePhoneNumberFromString } = require("libphonenumber-js");
    const parsed = parsePhoneNumberFromString(value, "NG" as any);
    if (!parsed) return false;
    return parsed.isValid() && parsed.country === "NG";
  } catch {
    return false;
  }
}
