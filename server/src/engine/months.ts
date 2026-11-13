/** Month keys are 'YYYY-MM' strings in UTC. */

export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return monthKey(new Date(Date.UTC(year, monthNumber - 1 + delta, 1)));
}

/** The `count` months before `month`, oldest first. */
export function previousMonths(month: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addMonths(month, index - count));
}
