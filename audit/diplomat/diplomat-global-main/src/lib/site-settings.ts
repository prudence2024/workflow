/**
 * Client-side site settings (announcement bar).
 *
 * Server-provided announcements from the root loader take priority.
 * Falls back to localStorage-stored announcements for offline/fallback.
 */

export interface Announcement {
  id: string;
  text: string;
  enabled: boolean;
  sort_order: number;
}

export const DEFAULT_ANNOUNCEMENTS: Announcement[] = [
  {
    id: "default-1",
    text: "Free Lagos delivery on orders over ₦250,000",
    enabled: true,
    sort_order: 0,
  },
  {
    id: "default-2",
    text: "All products quality-checked with 12-month warranty",
    enabled: true,
    sort_order: 1,
  },
  {
    id: "default-3",
    text: "Need something specific? Submit a product request and we will source it for you",
    enabled: true,
    sort_order: 2,
  },
];

const ANNOUNCEMENT_KEY = "dg-announcement-text";
const ANNOUNCEMENT_DATA_KEY = "dg-announcement-data";
const DISMISSED_KEY = "dg-announcement-dismissed";
export const DEFAULT_ROTATION_INTERVAL = 8000;

/**
 * Parse announcements from various sources.
 * Accepts JSON array (of objects or strings), "|||" separated string, or string array.
 */
export function parseAnnouncements(input: unknown): Announcement[] {
  if (Array.isArray(input)) {
    // Array of Announcement objects
    if (
      input.length > 0 &&
      typeof input[0] === "object" &&
      input[0] !== null &&
      "text" in input[0]
    ) {
      return (input as any[])
        .filter((a) => a && typeof a.text === "string" && a.text.trim().length > 0)
        .map((a, i) => ({
          id: a.id || `ann-${i}`,
          text: a.text,
          enabled: a.enabled !== false,
          sort_order: typeof a.sort_order === "number" ? a.sort_order : i,
        }))
        .sort((a, b) => a.sort_order - b.sort_order);
    }
    // Array of strings
    const strings = input.filter((s): s is string => typeof s === "string" && s.trim().length > 0);
    if (strings.length > 0) {
      return strings.map((text, i) => ({
        id: `legacy-${i}`,
        text,
        enabled: true,
        sort_order: i,
      }));
    }
  }
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return parseAnnouncements(parsed);
    } catch {
      /* Not JSON */
    }
    // "|||" separated
    return input
      .split("|||")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((text, i) => ({
        id: `legacy-${i}`,
        text,
        enabled: true,
        sort_order: i,
      }));
  }
  return [];
}

/**
 * Get enabled, sorted announcements from server data or localStorage.
 */
export function getAnnouncements(serverData?: unknown): Announcement[] {
  if (serverData !== undefined) {
    const parsed = parseAnnouncements(serverData);
    if (parsed.length > 0) return parsed;
  }

  // Try structured localStorage
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(ANNOUNCEMENT_DATA_KEY);
      if (raw) {
        const parsed = parseAnnouncements(JSON.parse(raw));
        if (parsed.length > 0) return parsed;
      }
    } catch {
      /* client: localStorage best-effort */
    }
    // Fallback to legacy "|||" localStorage
    try {
      const stored = window.localStorage.getItem(ANNOUNCEMENT_KEY)?.trim();
      if (stored) {
        const parsed = parseAnnouncements(stored);
        if (parsed.length > 0) return parsed;
      }
    } catch {
      /* client: localStorage best-effort */
    }
  }

  return DEFAULT_ANNOUNCEMENTS;
}

/**
 * Get only enabled, sorted announcements.
 */
export function getEnabledAnnouncements(serverData?: unknown): Announcement[] {
  return getAnnouncements(serverData).filter((a) => a.enabled);
}

/**
 * Get the announcement text array (enabled only) for display.
 */
export function getAnnouncementTexts(serverData?: unknown): string[] {
  return getEnabledAnnouncements(serverData).map((a) => a.text);
}

/**
 * Get rotation interval from server settings or default.
 */
export function getRotationInterval(serverSettings?: Record<string, string>): number {
  if (serverSettings?.announcement_rotation_interval) {
    const ms = parseInt(serverSettings.announcement_rotation_interval, 10);
    if (!isNaN(ms) && ms >= 2000 && ms <= 30000) return ms;
  }
  return DEFAULT_ROTATION_INTERVAL;
}

/**
 * Legacy compatibility — returns first enabled announcement text.
 */
export function getAnnouncementText(): string {
  return getAnnouncementTexts()[0] || DEFAULT_ANNOUNCEMENTS[0].text;
}

export function setAnnouncementText(value: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      ANNOUNCEMENT_KEY,
      value || DEFAULT_ANNOUNCEMENTS.map((a) => a.text).join("|||"),
    );
  } catch {
    /* client: localStorage best-effort */
  }
}

export function isAnnouncementDismissed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissAnnouncement(): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY, "1");
  } catch {
    /* client: localStorage best-effort */
  }
}
