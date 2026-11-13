import type { Category, Coverage, Plan, Purchase } from '../../../shared/types';
import { fromMinor, toMinor } from './money';
import { FREE_MONEY_ID } from './template';

export interface LedgerResult {
  categories: Category[];
  purchases: Purchase[];
}

/**
 * Replays the month's purchases in order and derives every jar's balance.
 * When a jar drops below zero the gap is covered from Free Money first, then from the
 * other flexible jars with money left. Fixed bills and the cushion are never touched;
 * whatever can't be covered is reported as `uncovered` on the purchase.
 */
export function applyLedger(plan: Plan, purchases: Purchase[]): LedgerResult {
  const categories = plan.categories;
  const available = new Map(categories.map((c) => [c.id, toMinor(c.allocated)]));
  const spent = new Map(categories.map((c) => [c.id, 0]));
  const coveredIn = new Map(categories.map((c) => [c.id, 0]));
  const coveredOut = new Map(categories.map((c) => [c.id, 0]));
  const add = (map: Map<string, number>, id: string, delta: number) => map.set(id, (map.get(id) ?? 0) + delta);

  const replayed = purchases.map((purchase) => {
    for (const split of purchase.splits) {
      add(spent, split.categoryId, toMinor(split.amount));
      add(available, split.categoryId, -toMinor(split.amount));
    }

    const coverage: Coverage[] = [];
    let uncovered = 0;
    for (const categoryId of new Set(purchase.splits.map((s) => s.categoryId))) {
      let deficit = -(available.get(categoryId) ?? 0);
      if (deficit <= 0) continue;
      for (const donorId of donorsFor(categoryId, categories, available)) {
        const take = Math.min(deficit, available.get(donorId) ?? 0);
        if (take <= 0) continue;
        add(available, donorId, -take);
        add(available, categoryId, take);
        add(coveredOut, donorId, take);
        add(coveredIn, categoryId, take);
        coverage.push({ fromCategoryId: donorId, toCategoryId: categoryId, amount: fromMinor(take) });
        deficit -= take;
        if (deficit === 0) break;
      }
      uncovered += deficit;
    }
    return { ...purchase, coverage, uncovered: fromMinor(uncovered) };
  });

  return {
    categories: categories.map((c) => ({
      ...c,
      spent: fromMinor(spent.get(c.id) ?? 0),
      remaining: fromMinor(available.get(c.id) ?? 0),
      coveredIn: fromMinor(coveredIn.get(c.id) ?? 0),
      coveredOut: fromMinor(coveredOut.get(c.id) ?? 0),
    })),
    purchases: replayed,
  };
}

/** Free Money first, then other flexible jars with the most money left. Never fixed or savings. */
function donorsFor(categoryId: string, categories: Category[], available: Map<string, number>): string[] {
  const flexible = categories.filter((c) => c.type === 'flexible' && c.id !== categoryId);
  const free = flexible.filter((c) => c.id === FREE_MONEY_ID);
  const others = flexible
    .filter((c) => c.id !== FREE_MONEY_ID)
    .sort((a, b) => (available.get(b.id) ?? 0) - (available.get(a.id) ?? 0));
  return [...free, ...others].map((c) => c.id);
}
