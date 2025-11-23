import { addDays, parseISO, startOfDay } from "date-fns";
import type { AnalyticsQuery } from "./schemas";

export type DateRange = { start: Date; end: Date };

export function resolveDateRange(query: AnalyticsQuery): DateRange {
  const today = startOfDay(new Date());
  const start = query.from ? startOfDay(parseISO(query.from)) : addDays(today, -29);
  const end = query.to ? startOfDay(parseISO(query.to)) : today;
  if (start > end) {
    return { start: end, end: start };
  }
  return { start, end };
}

export function normalizeStores(stores?: string[]): string[] | undefined {
  if (!stores || stores.length === 0) return undefined;
  return stores.filter(Boolean);
}
