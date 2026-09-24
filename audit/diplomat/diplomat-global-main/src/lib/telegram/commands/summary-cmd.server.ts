import { generateDailySummary, generateWeeklySummary } from "../formatters/summary";

export async function handleSummary(): Promise<string> {
  return generateDailySummary();
}

export async function handleWeeklySummary(): Promise<string> {
  return generateWeeklySummary();
}
