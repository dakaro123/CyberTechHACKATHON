import type { AppState } from '../../shared/types';

/** Names of the jars that covered overspends in `categoryId`, e.g. "Free Money". */
export function coverageDonors(state: AppState, categoryId: string): string {
  const names = new Map(state.plan?.categories.map((c) => [c.id, c.name]));
  const donors = new Set(
    state.purchases.flatMap((p) =>
      p.coverage.filter((c) => c.toCategoryId === categoryId).map((c) => names.get(c.fromCategoryId) ?? c.fromCategoryId),
    ),
  );
  return [...donors].join(' and ');
}
