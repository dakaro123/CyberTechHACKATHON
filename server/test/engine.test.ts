import { describe, expect, it } from 'vitest';
import type { FxQuote, Plan, Purchase } from '../../shared/types';
import { suggestCategory } from '../src/data/merchants';
import { buildForecast } from '../src/engine/forecast';
import { applyLedger } from '../src/engine/ledger';
import { summarizeMonthEnd } from '../src/engine/monthEnd';
import { buildPlan } from '../src/engine/plan';
import { normalizeSplits } from '../src/engine/splits';

const now = new Date('2026-11-13T10:00:00Z');

const quote = (categoryId: string, targetAmount: number, sourceAmount: number): FxQuote => ({
  id: `q_${categoryId}`,
  categoryId,
  source: 'GBP',
  target: 'EUR',
  rate: 1.2,
  sourceAmount,
  targetAmount,
  fee: 2,
  provider: 'wise',
  live: true,
  fetchedAt: now.toISOString(),
});

const makePlan = (salary: number, overrides?: Record<string, number>) =>
  buildPlan({
    id: 'plan',
    month: '2026-11',
    salary,
    currency: 'GBP',
    overrides,
    quotes: { rent: quote('rent', 800, 668.67), utilities: quote('utilities', 140, 118.67) },
    hints: { food: { usually: 267, forecast: 280 }, car: { usually: 143, forecast: 150 } },
    now,
  });

const jars = (plan: Pick<Plan, 'categories'>) => Object.fromEntries(plan.categories.map((c) => [c.id, c]));

const purchase = (id: string, categoryId: string, amount: number): Purchase => ({
  id,
  merchant: id,
  amount,
  currency: 'GBP',
  suggestedCategoryId: categoryId,
  suggestion: { confidence: 1, reason: 'test' },
  icon: 'store',
  splits: [{ categoryId, amount }],
  createdAt: now.toISOString(),
  coverage: [],
  uncovered: 0,
});

const catchError = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error;
  }
  throw new Error('Expected an error');
};

describe('buildPlan', () => {
  it('funds fixed bills at the Wise quote, then the cushion, then flexible jars; Free Money takes the rest', () => {
    const plan = makePlan(2000);
    const c = jars(plan);

    expect(c.rent).toMatchObject({ allocated: 668.67, locked: true, bill: { currency: 'EUR', amount: 800, quoteId: 'q_rent' } });
    expect(c.utilities.allocated).toBe(118.67);
    expect(c.cushion.allocated).toBe(200);
    expect(c.food).toMatchObject({ allocated: 280, usually: 267, locked: false });
    expect(c.car.allocated).toBe(150);
    expect(c.free.allocated).toBe(582.66);
    expect(plan.warnings).toEqual([]);
    expect(plan.fxQuotes.map((q) => q.id)).toEqual(['q_rent', 'q_utilities']);
  });

  it('lets the user adjust a flexible jar while Free Money absorbs the difference', () => {
    const c = jars(makePlan(2000, { food: 250 }));
    expect(c.food.allocated).toBe(250);
    expect(c.free.allocated).toBe(612.66);
  });

  it('funds bills first and leaves the cushion and flexible jars empty when salary is below fixed bills', () => {
    const plan = makePlan(700);
    const c = jars(plan);

    expect(c.rent.allocated).toBe(668.67);
    expect(c.utilities).toMatchObject({ allocated: 31.33, shortfall: 87.34 });
    expect([c.cushion, c.food, c.car, c.free].map((jar) => jar.allocated)).toEqual([0, 0, 0, 0]);
    expect(plan.warnings.map((w) => w.code)).toEqual(['SALARY_BELOW_FIXED']);
  });

  it('scales flexible jars down in a tight month and leaves Free Money empty', () => {
    const plan = makePlan(1200);
    const c = jars(plan);

    expect(c.cushion.allocated).toBe(120);
    expect(c.food.allocated).toBe(190.57);
    expect(c.car.allocated).toBe(102.09);
    expect(c.free.allocated).toBe(0);
    expect(plan.warnings.map((w) => w.code)).toEqual(['FLEXIBLE_SCALED']);
  });
});

describe('applyLedger', () => {
  it('covers an overspend from Free Money and never touches rent or the cushion', () => {
    const plan = makePlan(2000);
    const { categories, purchases } = applyLedger(plan, [purchase('big-shop', 'food', 300)]);
    const c = jars({ categories });

    expect(purchases[0].coverage).toEqual([{ fromCategoryId: 'free', toCategoryId: 'food', amount: 20 }]);
    expect(c.food).toMatchObject({ spent: 300, remaining: 0, coveredIn: 20 });
    expect(c.free).toMatchObject({ remaining: 562.66, coveredOut: 20 });
    expect(c.rent.remaining).toBe(668.67);
    expect(c.cushion.remaining).toBe(200);
  });

  it('uses other flexible jars once Free Money is empty and reports what cannot be covered', () => {
    const plan = makePlan(2000);
    const { categories, purchases } = applyLedger(plan, [
      purchase('treat', 'free', 582.66),
      purchase('huge-shop', 'food', 500),
    ]);
    const c = jars({ categories });

    expect(purchases[1].coverage).toEqual([{ fromCategoryId: 'car', toCategoryId: 'food', amount: 150 }]);
    expect(purchases[1].uncovered).toBe(70);
    expect(c.food.remaining).toBe(-70);
    expect([c.rent.remaining, c.utilities.remaining, c.cushion.remaining]).toEqual([668.67, 118.67, 200]);
  });
});

describe('normalizeSplits', () => {
  const { categories } = makePlan(2000);
  const target = { amount: 35.32, currency: 'GBP', suggestedCategoryId: 'food' };

  it('moves part of a purchase to another flexible jar and merges duplicate jars', () => {
    const splits = [
      { categoryId: 'food', amount: 20 },
      { categoryId: 'free', amount: 10 },
      { categoryId: 'food', amount: 5.32 },
    ];
    expect(normalizeSplits(target, splits, categories)).toEqual([
      { categoryId: 'food', amount: 25.32 },
      { categoryId: 'free', amount: 10 },
    ]);
  });

  it('absorbs a 1p rounding gap in the largest split', () => {
    const splits = [
      { categoryId: 'food', amount: 17.66 },
      { categoryId: 'free', amount: 17.65 },
    ];
    expect(normalizeSplits(target, splits, categories)).toEqual([
      { categoryId: 'food', amount: 17.67 },
      { categoryId: 'free', amount: 17.65 },
    ]);
  });

  it.each([
    ['the cushion', [{ categoryId: 'cushion', amount: 35.32 }], 'PROTECTED_CATEGORY'],
    ['a fixed bill', [{ categoryId: 'rent', amount: 35.32 }], 'PROTECTED_CATEGORY'],
    ['a wrong total', [{ categoryId: 'food', amount: 30 }], 'SPLIT_MISMATCH'],
    ['an unknown jar', [{ categoryId: 'holiday', amount: 35.32 }], 'UNKNOWN_CATEGORY'],
    ['no splits', [], 'INVALID_SPLITS'],
  ])('rejects %s', (_label, splits, code) => {
    expect(catchError(() => normalizeSplits(target, splits, categories))).toMatchObject({ status: 400, code });
  });
});

describe('summarizeMonthEnd', () => {
  it('sweeps flexible leftovers into the cushion and keeps fixed bills reserved', () => {
    const { categories } = applyLedger(makePlan(2000), [purchase('shop', 'food', 250), purchase('fuel', 'car', 150)]);
    const result = summarizeMonthEnd({ month: '2026-11', categories, cushionBalance: 1250, final: true, now });

    expect(result.sweeps).toEqual([
      { categoryId: 'food', name: 'Food', amount: 30 },
      { categoryId: 'free', name: 'Free Money', amount: 582.66 },
    ]);
    expect(result).toMatchObject({ saved: 612.66, plannedSavings: 200, cushionAfter: 2062.66, spent: 400, final: true });
  });
});

describe('buildForecast', () => {
  it('uses the 3-month moving average plus 5%, rounded to 5', () => {
    const history = (
      [
        ['2026-08', 250],
        ['2026-09', 270],
        ['2026-10', 280],
      ] as const
    ).map(([month, amount], index) => ({
      id: `h${index}`,
      month,
      date: `${month}-10`,
      merchant: 'Maxima',
      categoryId: 'food',
      amount,
    }));
    const forecast = buildForecast({
      month: '2026-11',
      currency: 'GBP',
      history,
      categories: [{ id: 'food', name: 'Food', icon: 'shopping_basket' }],
    });

    expect(forecast.historyMonths).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(forecast.categories[0]).toMatchObject({ usually: 267, forecast: 280 });
  });
});

describe('suggestCategory', () => {
  it.each([
    ['Maxima', 'food'],
    ['MAXIMA X Vilnius', 'food'],
    ['Bolt Food', 'food'],
    ['Bolt', 'car'],
    ['Netflix.com', 'free'],
    ['Joe’s Pizza', 'free'],
    ['Some new shop', 'free'],
  ])('%s → %s', (merchant, categoryId) => {
    expect(suggestCategory(merchant).categoryId).toBe(categoryId);
  });
});
