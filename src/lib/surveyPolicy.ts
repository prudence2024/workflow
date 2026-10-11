export const SURVEY_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;

export function isSurveyDue(lastInteraction: Date | null, now = new Date()): boolean {
  return !lastInteraction || now.getTime() - lastInteraction.getTime() >= SURVEY_INTERVAL_MS;
}

export function periodStart(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
