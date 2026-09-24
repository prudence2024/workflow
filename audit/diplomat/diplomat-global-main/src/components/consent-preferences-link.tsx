import { CONSENT_CHANGED_EVENT } from "@/lib/consent";

/**
 * Footer control that lets visitors reopen cookie preferences at any time —
 * consent must be modifiable, not a one-time popup. The banner component
 * listens for the same consent-changed event and re-shows itself.
 */
export function ConsentPreferencesLink() {
  const reopen = () => {
    // The banner shows itself whenever there is no stored consent; so a
    // reopen works by removing the stored choice and announcing the change.
    try {
      localStorage.removeItem("dg-cookie-consent");
    } catch {
      /* storage optional */
    }
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT));
  };

  // Rendered as a plain control; visibility in the footer is static.
  return (
    <button
      type="button"
      onClick={reopen}
      className="text-sm text-muted-foreground underline-offset-2 hover:underline"
    >
      Cookie preferences
    </button>
  );
}
