import type { Category, FxQuote, Plan, PlanWarning } from '../../../shared/types';
import { DomainError } from './errors';
import { formatMoney, fromMinor, round2, sumMinor, toMinor } from './money';
import { CATEGORY_TEMPLATE, DEFAULT_SAVINGS_RATE, type CategoryTemplate } from './template';

export interface FlexibleHint {
  usually: number;
  forecast: number;
}

export interface BuildPlanInput {
  id: string;
  month: string;
  salary: number;
  currency: string;
  savingsRate?: number;
  /** Planned amounts for flexible jars (Free Money excluded), keyed by category id. */
  overrides?: Record<string, number>;
  /** Wise quotes for fixed bills in another currency, keyed by category id. */
  quotes?: Record<string, FxQuote>;
  /** Forecast per flexible category id. */
  hints?: Record<string, FlexibleHint>;
  template?: CategoryTemplate[];
  now: Date;
}

/**
 * Splits a salary into jars. Rules, in order:
 * 1. Fixed bills (rent, utilities) are funded first, at the Wise quote for foreign-currency bills.
 * 2. The safety cushion gets `savingsRate` of the salary from what is left.
 * 3. Flexible jars get their forecast (or override); if money is short they are scaled down.
 * 4. Free Money receives the remainder, so the plan always adds up to the salary.
 */
export function buildPlan(input: BuildPlanInput): Plan {
  const template = input.template ?? CATEGORY_TEMPLATE;
  const savingsRate = input.savingsRate ?? DEFAULT_SAVINGS_RATE;
  const overrides = input.overrides ?? {};
  const quotes = input.quotes ?? {};
  const hints = input.hints ?? {};
  const money = (minor: number) => formatMoney(fromMinor(minor), input.currency);

  const warnings: PlanWarning[] = [];
  const allocated = new Map<string, number>();
  const extras = new Map<string, Partial<Category>>();
  const usedQuotes: FxQuote[] = [];
  let left = toMinor(input.salary);

  let fixedNeed = 0;
  let fixedShort = 0;
  for (const item of template.filter((t) => t.type === 'fixed')) {
    let need = toMinor(item.defaultAmount ?? 0);
    let quoteId: string | undefined;
    if (item.bill) {
      if (item.bill.currency === input.currency) {
        need = toMinor(item.bill.amount);
      } else {
        const quote = quotes[item.id];
        if (!quote) {
          throw new DomainError(502, 'FX_UNAVAILABLE', `No ${input.currency}→${item.bill.currency} quote for ${item.name}.`);
        }
        need = toMinor(quote.sourceAmount);
        quoteId = quote.id;
        usedQuotes.push(quote);
      }
    }
    const give = Math.min(need, left);
    left -= give;
    fixedNeed += need;
    fixedShort += need - give;
    allocated.set(item.id, give);
    extras.set(item.id, {
      ...(item.bill ? { bill: { ...item.bill, ...(quoteId ? { quoteId } : {}) } } : {}),
      ...(need > give ? { shortfall: fromMinor(need - give) } : {}),
    });
  }
  if (fixedShort > 0) {
    warnings.push({
      code: 'SALARY_BELOW_FIXED',
      message: `Salary is ${money(fixedShort)} short of fixed bills (${money(fixedNeed)}). Bills are funded first; the cushion and flexible jars stay empty this month.`,
    });
  }

  for (const item of template.filter((t) => t.type === 'savings')) {
    const target = toMinor(input.salary * savingsRate);
    const give = Math.min(target, left);
    left -= give;
    if (give < target && fixedShort === 0) {
      warnings.push({
        code: 'SAVINGS_REDUCED',
        message: `Only ${money(give)} of the planned ${money(target)} fits into the cushion after fixed bills.`,
      });
    }
    allocated.set(item.id, give);
  }

  const flexible = template.filter((t) => t.type === 'flexible' && !t.remainder);
  const wanted = flexible.map((item) => toMinor(overrides[item.id] ?? hints[item.id]?.forecast ?? item.defaultAmount ?? 0));
  const totalWanted = sumMinor(wanted);
  let given = wanted;
  if (totalWanted > left) {
    if (left > 0) {
      warnings.push({
        code: 'FLEXIBLE_SCALED',
        message: `Tight month: flexible jars get ${Math.floor((left / totalWanted) * 100)}% of the usual amounts and Free Money is empty.`,
      });
    }
    given = scaleDown(wanted, left);
  }
  flexible.forEach((item, index) => {
    allocated.set(item.id, given[index]);
    left -= given[index];
    const hint = hints[item.id];
    if (hint) extras.set(item.id, { forecast: hint.forecast, usually: hint.usually });
  });

  for (const item of template.filter((t) => t.remainder)) {
    allocated.set(item.id, left);
    left = 0;
  }

  const categories = template.map((item) => {
    const amount = fromMinor(allocated.get(item.id) ?? 0);
    const category: Category = {
      id: item.id,
      name: item.name,
      type: item.type,
      currency: input.currency,
      allocated: amount,
      spent: 0,
      icon: item.icon,
      remaining: amount,
      coveredIn: 0,
      coveredOut: 0,
      locked: item.type !== 'flexible',
      ...extras.get(item.id),
    };
    return category;
  });

  return {
    id: input.id,
    month: input.month,
    status: 'draft',
    salary: round2(input.salary),
    currency: input.currency,
    savingsRate,
    overrides: { ...overrides },
    categories,
    fxQuotes: usedQuotes,
    warnings,
    createdAt: input.now.toISOString(),
  };
}

/** Proportionally scales amounts down to fit `budget`, distributing leftover pennies fairly. */
function scaleDown(wanted: number[], budget: number): number[] {
  const total = sumMinor(wanted);
  if (budget <= 0 || total <= 0) return wanted.map(() => 0);
  const raw = wanted.map((amount) => (amount * budget) / total);
  const result = raw.map(Math.floor);
  let rest = budget - sumMinor(result);
  const order = raw.map((value, index) => ({ index, fraction: value - result[index] })).sort((a, b) => b.fraction - a.fraction);
  for (const { index } of order) {
    if (rest <= 0) break;
    result[index] += 1;
    rest -= 1;
  }
  return result;
}
