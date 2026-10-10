"use client";

import { useEffect, useMemo, useState } from "react";
import { HelpText, Input, Label, Select } from "@/components/ui/Field";
import { countryForPhone, detectPhoneCountry, normalizeInternationalPhone, PHONE_COUNTRIES } from "@/lib/phoneNumber";

export function InternationalPhoneInput({
  value,
  countryCode,
  onChange,
}: {
  value: string;
  countryCode: string;
  onChange: (value: string, countryCode: string) => void;
}) {
  const [country, setCountry] = useState(countryCode);
  const selected = useMemo(() => PHONE_COUNTRIES.find((item) => item.code === country) ?? null, [country]);
  const normalized = selected ? normalizeInternationalPhone(value, selected.dialCode) : null;

  useEffect(() => {
    if (countryCode) {
      setCountry(countryCode);
      return;
    }
    const inferred = countryForPhone(value)?.code ?? detectPhoneCountry();
    if (inferred) setCountry(inferred);
  }, [countryCode, value]);

  function changeCountry(nextCountry: string) {
    setCountry(nextCountry);
    onChange(value, nextCountry);
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor="phone">Phone number</Label>
      <div className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.65fr)]">
        <Select aria-label="Phone country" name="phoneCountry" value={country} onChange={(event) => changeCountry(event.target.value)} required>
          <option value="">Country</option>
          {PHONE_COUNTRIES.map((item) => <option key={`${item.code}-${item.dialCode}`} value={item.code}>{item.flag} {item.name} ({item.dialCode})</option>)}
        </Select>
        <Input id="phone" name="phone" type="tel" value={value} onChange={(event) => onChange(event.target.value, country)} placeholder={selected?.code === "NG" ? "08012345678" : "Phone number"} autoComplete="tel" required />
      </div>
      <input type="hidden" name="phoneCountryDialCode" value={selected?.dialCode ?? ""} />
      <HelpText>{normalized ? `Saved as ${normalized}. No verification SMS is sent during onboarding.` : "Choose a country and enter a valid phone number. No verification SMS is sent during onboarding."}</HelpText>
    </div>
  );
}
