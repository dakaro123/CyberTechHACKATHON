import type { Category, Purchase } from '../../../shared/types';
import { money, shortDate, timeAgo } from '../format';
import { jarStyle } from '../theme';
import { Icon } from './ui';

export function PurchaseRow({ purchase, categories, onClick }: { purchase: Purchase; categories: Category[]; onClick(): void }) {
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const style = jarStyle(purchase.splits[0]?.categoryId ?? purchase.suggestedCategoryId);
  const jarLabel = purchase.splits.map((s) => names.get(s.categoryId) ?? s.categoryId).join(' + ');

  let note = <span className="font-currency-tag text-currency-tag uppercase text-outline">Card</span>;
  if (purchase.uncovered > 0) {
    note = <span className="font-currency-tag text-currency-tag uppercase text-error">Over budget</span>;
  } else if (purchase.coverage.length > 0) {
    note = <span className="font-currency-tag text-currency-tag uppercase text-primary">Covered</span>;
  } else if (purchase.original) {
    note = (
      <span className="font-currency-tag text-currency-tag text-outline">
        {money(purchase.original.amount, purchase.original.currency)}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-surface-container-low"
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
          style={{ background: style.bg, color: style.fg }}
        >
          <Icon name={purchase.icon} className="text-[20px]" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-label-bold text-label-bold text-on-surface">{purchase.merchant}</span>
          <div className="flex items-center gap-1.5">
            <span className="truncate font-body-sm text-body-sm text-on-surface-variant">{jarLabel}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-outline-variant" />
            <span className="shrink-0 font-body-sm text-body-sm text-outline">{timeAgo(purchase.createdAt)}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end pl-3">
        <span className="tabular font-label-bold text-label-bold text-on-surface">-{money(purchase.amount, purchase.currency)}</span>
        {note}
      </div>
    </button>
  );
}

export function SalaryRow({ amount, currency, employer, date }: { amount: number; currency: string; employer: string; date: string }) {
  return (
    <div className="flex items-center justify-between p-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-fixed text-on-secondary-fixed">
          <Icon name="south_west" className="text-[20px]" />
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-label-bold text-label-bold text-on-surface">{employer}</span>
          <div className="flex items-center gap-1.5">
            <span className="truncate font-body-sm text-body-sm text-on-surface-variant">Salary, split into jars</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-outline-variant" />
            <span className="shrink-0 font-body-sm text-body-sm text-outline">{shortDate(date)}</span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end pl-3">
        <span className="tabular font-label-bold text-label-bold text-primary">+{money(amount, currency)}</span>
        <span className="font-currency-tag text-currency-tag uppercase text-primary">Received</span>
      </div>
    </div>
  );
}
