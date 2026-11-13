import type { Category, Split } from '../../../shared/types';
import { badRequest } from './errors';
import { formatMoney, fromMinor, sumMinor, toMinor } from './money';

const MAX_SPLITS = 10;

interface SplitTarget {
  amount: number;
  currency: string;
  suggestedCategoryId: string;
}

/**
 * Validates how a purchase is spread across jars. Money only moves between flexible jars;
 * a fixed bill may keep its own suggested category, and savings are never spendable.
 * Splits must add up to the purchase amount (a 1p rounding gap is absorbed by the largest split).
 */
export function normalizeSplits(purchase: SplitTarget, input: unknown, categories: Category[]): Split[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw badRequest('INVALID_SPLITS', 'Provide at least one split: [{ "categoryId": "food", "amount": 10 }].');
  }
  if (input.length > MAX_SPLITS) {
    throw badRequest('INVALID_SPLITS', `A purchase can be split into at most ${MAX_SPLITS} parts.`);
  }

  const byId = new Map(categories.map((c) => [c.id, c]));
  const merged = new Map<string, number>();
  for (const raw of input as Array<Partial<Split> | null>) {
    const categoryId = raw?.categoryId;
    const amount = raw?.amount;
    const category = typeof categoryId === 'string' ? byId.get(categoryId) : undefined;
    if (!category) {
      throw badRequest('UNKNOWN_CATEGORY', `Unknown category "${String(categoryId)}".`);
    }
    if (typeof amount !== 'number' || !Number.isFinite(amount) || toMinor(amount) <= 0) {
      throw badRequest('INVALID_AMOUNT', 'Split amounts must be at least 0.01.');
    }
    if (category.type === 'savings') {
      throw badRequest('PROTECTED_CATEGORY', `${category.name} is protected: purchases can't be charged to savings.`);
    }
    if (category.type === 'fixed' && category.id !== purchase.suggestedCategoryId) {
      throw badRequest('PROTECTED_CATEGORY', `${category.name} is a fixed bill: purchases can only move between flexible jars.`);
    }
    merged.set(category.id, (merged.get(category.id) ?? 0) + toMinor(amount));
  }

  const total = toMinor(purchase.amount);
  const sum = sumMinor([...merged.values()]);
  if (Math.abs(sum - total) > 1) {
    const money = (minor: number) => formatMoney(fromMinor(minor), purchase.currency);
    throw badRequest('SPLIT_MISMATCH', `Splits add up to ${money(sum)}, but the purchase is ${money(total)}.`);
  }
  if (sum !== total) {
    const [largestId, largest] = [...merged.entries()].sort((a, b) => b[1] - a[1])[0];
    merged.set(largestId, largest + (total - sum));
  }

  return [...merged.entries()]
    .filter(([, minor]) => minor > 0)
    .map(([categoryId, minor]) => ({ categoryId, amount: fromMinor(minor) }));
}
