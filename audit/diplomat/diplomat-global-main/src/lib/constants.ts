/**
 * Single source of truth for Diplomat Global business constants.
 * All components/pages should import from here rather than hardcoding.
 */

/** Canonical business address — used in contact, footer, receipts, emails */
export const BUSINESS_ADDRESS =
  "No. 14 Francis Oremeji Street, Distinct Plaza Suite 5, Opposite UBA PLC, Computer Village, Ikeja, Lagos";

/** Short location label for displays with limited space */
export const BUSINESS_LOCATION = "Ikeja, Lagos";

/** Google Maps directions URL (configurable via admin settings) */
export const DEFAULT_MAPS_DIRECTIONS_URL =
  "https://www.google.com/maps/dir/?api=1&destination=No+14+Francis+Oremeji+Street+Computer+Village+Ikeja+Lagos";
