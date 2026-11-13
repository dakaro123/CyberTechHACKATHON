import type { Category, MonthEndResult } from '../../../shared/types';
import { fromMinor, sumMinor, toMinor } from './money';

export interface MonthEndInput {
  month: string;
  /** Categories with balances already derived by the ledger. */
  categories: Category[];
  /** Cushion saved in previous months. */
  cushionBalance: number;
  final: boolean;
  now: Date;
}

/**
 * Leftovers of flexible jars are swept into the safety cushion.
 * Fixed bills stay reserved for their standing orders and are never swept.
 */
export function summarizeMonthEnd(input: MonthEndInput): MonthEndResult {
  const sweeps = input.categories
    .filter((c) => c.type === 'flexible' && toMinor(c.remaining) > 0)
    .map((c) => ({ categoryId: c.id, name: c.name, amount: c.remaining }));
  const saved = sumMinor(sweeps.map((s) => toMinor(s.amount)));
  const plannedSavings = sumMinor(input.categories.filter((c) => c.type === 'savings').map((c) => toMinor(c.allocated)));
  const spent = sumMinor(input.categories.map((c) => toMinor(c.spent)));
  const uncovered = sumMinor(input.categories.map((c) => Math.max(0, -toMinor(c.remaining))));
  const cushionBefore = toMinor(input.cushionBalance);

  return {
    month: input.month,
    saved: fromMinor(saved),
    sweeps,
    plannedSavings: fromMinor(plannedSavings),
    cushionBefore: fromMinor(cushionBefore),
    cushionAfter: fromMinor(cushionBefore + plannedSavings + saved),
    spent: fromMinor(spent),
    uncovered: fromMinor(uncovered),
    final: input.final,
    ...(input.final ? { closedAt: input.now.toISOString() } : {}),
  };
}
