import type {
  AppState,
  Category,
  Forecast,
  FxQuote,
  MerchantInfo,
  MonthEndResult,
  Phase,
  Plan,
  Purchase,
  PurchaseResult,
  Totals,
} from '../../shared/types';
import { generateHistory } from './data/history';
import { MERCHANTS, suggestCategory } from './data/merchants';
import { badRequest, conflict, notFound } from './engine/errors';
import { buildForecast, type HistoryEntry } from './engine/forecast';
import { applyLedger } from './engine/ledger';
import { fromMinor, round2, sumMinor, toMinor } from './engine/money';
import { summarizeMonthEnd } from './engine/monthEnd';
import { addMonths, monthKey } from './engine/months';
import { buildPlan, type FlexibleHint } from './engine/plan';
import { normalizeSplits } from './engine/splits';
import {
  CATEGORY_TEMPLATE,
  DEFAULT_SALARY,
  DEFAULT_SAVINGS_RATE,
  EMPLOYER,
  FREE_MONEY_ID,
  MAX_SAVINGS_RATE,
  PLAN_CURRENCY,
  STARTING_CUSHION,
} from './engine/template';
import type { FxProvider } from './wise/fx';

export interface ServiceOptions {
  fx: FxProvider;
  now?: () => Date;
  /** Seed for the synthetic history. */
  seed?: number;
}

interface State {
  phase: Phase;
  month: string;
  plan: Plan | null;
  purchases: Purchase[];
  history: HistoryEntry[];
  cushionBalance: number;
  lastMonthEnd: MonthEndResult | null;
  lastFx: FxQuote | null;
  sequence: number;
}

const FLEXIBLE_JARS = CATEGORY_TEMPLATE.filter((t) => t.type === 'flexible');
const ADJUSTABLE_JARS = new Set(FLEXIBLE_JARS.filter((t) => !t.remainder).map((t) => t.id));

/** In-memory Wise Flow: one user, one month at a time. Express routes are thin wrappers around it. */
export class WiseFlowService {
  private readonly fx: FxProvider;
  private readonly now: () => Date;
  private readonly seed?: number;
  private state!: State;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: ServiceOptions) {
    this.fx = options.fx;
    this.now = options.now ?? (() => new Date());
    this.seed = options.seed;
    this.resetState();
  }

  get fxDescription(): string {
    return this.fx.description;
  }

  /**
   * Runs state changes one at a time, in call order. Payday awaits Wise quotes; without this an
   * approve or reset arriving during that wait would be overwritten by the stale draft.
   */
  private exclusive<T>(task: () => T | Promise<T>): Promise<T> {
    const result = this.queue.then(task);
    this.queue = result.catch(() => undefined);
    return result;
  }

  reset(): Promise<AppState> {
    return this.exclusive(() => this.resetState());
  }

  private resetState(): AppState {
    const month = monthKey(this.now());
    this.state = {
      phase: 'awaiting-payday',
      month,
      plan: null,
      purchases: [],
      history: generateHistory(month, this.seed),
      cushionBalance: STARTING_CUSHION,
      lastMonthEnd: null,
      lastFx: null,
      sequence: 0,
    };
    return this.getState();
  }

  getState(): AppState {
    const { state } = this;
    const ledger = state.plan ? applyLedger(state.plan, state.purchases) : null;
    const categories = ledger?.categories ?? [];
    let monthEnd: MonthEndResult | null = null;
    if (state.phase === 'closed') monthEnd = state.lastMonthEnd;
    if (state.phase === 'active') {
      monthEnd = summarizeMonthEnd({
        month: state.month,
        categories,
        cushionBalance: state.cushionBalance,
        final: false,
        now: this.now(),
      });
    }
    return {
      phase: state.phase,
      month: state.month,
      currency: PLAN_CURRENCY,
      defaultSalary: DEFAULT_SALARY,
      defaultSavingsRate: DEFAULT_SAVINGS_RATE,
      employer: EMPLOYER,
      bills: CATEGORY_TEMPLATE.flatMap((t) =>
        t.bill ? [{ categoryId: t.id, name: t.name, currency: t.bill.currency, amount: t.bill.amount }] : [],
      ),
      plan: state.plan ? { ...state.plan, categories } : null,
      purchases: ledger?.purchases ?? [],
      cushionBalance: state.cushionBalance,
      monthEnd,
      fx: state.lastFx,
      totals: computeTotals(categories),
    };
  }

  /** POST /payday: builds (or rebuilds) the draft plan. Nothing is committed until /plan/approve. */
  payday(body: unknown): Promise<Plan> {
    return this.exclusive(() => this.buildDraft(body));
  }

  private async buildDraft(body: unknown): Promise<Plan> {
    const { state } = this;
    if (state.phase === 'active') {
      throw conflict('MONTH_ACTIVE', 'This month is still running. Close the month before the next payday.');
    }
    const request = parsePaydayRequest(body);
    const month = state.phase === 'closed' ? addMonths(state.month, 1) : state.month;
    const now = this.now();

    const reusable = state.phase === 'draft' && !request.refreshQuotes ? state.plan?.fxQuotes ?? [] : [];
    const quotes: Record<string, FxQuote> = {};
    await Promise.all(
      CATEGORY_TEMPLATE.filter((t) => t.type === 'fixed' && t.bill && t.bill.currency !== request.currency).map(async (t) => {
        const bill = t.bill!;
        const existing = reusable.find(
          (q) =>
            q.categoryId === t.id &&
            q.source === request.currency &&
            q.target === bill.currency &&
            q.targetAmount === bill.amount &&
            (!q.expiresAt || Date.parse(q.expiresAt) > now.getTime()),
        );
        quotes[t.id] =
          existing ??
          (await this.fx.quote({ source: request.currency, target: bill.currency, targetAmount: bill.amount, categoryId: t.id }));
      }),
    );

    const forecast = this.buildForecastFor(month);
    const hints: Record<string, FlexibleHint> = {};
    for (const item of forecast.categories) {
      if (item.forecast > 0) hints[item.categoryId] = { usually: item.usually, forecast: item.forecast };
    }

    const plan = buildPlan({
      id: `plan_${month}`,
      month,
      salary: request.amount,
      currency: request.currency,
      savingsRate: request.savingsRate,
      overrides: request.overrides,
      quotes,
      hints,
      now,
    });
    if (plan.fxQuotes.some((q) => !q.live)) {
      plan.warnings.push({
        code: 'FX_FALLBACK',
        message: 'Wise API is unreachable, so bills use the last known rate. Refresh the quote before approving.',
      });
    }

    if (state.phase === 'closed') {
      state.month = month;
      state.purchases = [];
      state.lastMonthEnd = null;
    }
    state.plan = plan;
    state.phase = 'draft';
    state.lastFx = plan.fxQuotes.find((q) => q.categoryId === 'rent') ?? plan.fxQuotes[0] ?? state.lastFx;
    return this.currentPlan();
  }

  /** POST /plan/approve: the user confirms; jars are created and the month starts. */
  approve(): Promise<Plan> {
    return this.exclusive(() => {
      const { state } = this;
      if (state.phase !== 'draft' || !state.plan) {
        throw conflict('NO_DRAFT_PLAN', 'There is no draft plan to approve. Start with POST /payday.');
      }
      state.plan = { ...state.plan, status: 'active', approvedAt: this.now().toISOString() };
      state.phase = 'active';
      state.purchases = [];
      return this.currentPlan();
    });
  }

  getPlan(): Plan {
    if (!this.state.plan) throw notFound('NO_PLAN', 'No plan yet. Start with POST /payday.');
    return this.currentPlan();
  }

  categories(): Category[] {
    return this.state.plan ? applyLedger(this.state.plan, this.state.purchases).categories : [];
  }

  purchases(): Purchase[] {
    return this.state.plan ? applyLedger(this.state.plan, this.state.purchases).purchases : [];
  }

  /** POST /purchases: a card payment; the merchant directory suggests a jar. */
  createPurchase(body: unknown): Promise<PurchaseResult> {
    return this.exclusive(() => this.recordPurchase(body));
  }

  private async recordPurchase(body: unknown): Promise<PurchaseResult> {
    const plan = this.requireActivePlan();
    const request = parsePurchaseRequest(body, plan.currency);
    const suggestion = suggestCategory(request.merchant);
    const known = new Set(plan.categories.map((c) => c.id));
    const suggestedCategoryId = known.has(suggestion.categoryId) ? suggestion.categoryId : FREE_MONEY_ID;

    let amount = round2(request.amount);
    let original: Purchase['original'];
    if (request.currency !== plan.currency) {
      const rate = await this.rateFor(plan, request.currency);
      amount = round2(request.amount / rate);
      original = { amount: round2(request.amount), currency: request.currency, rate };
    }
    if (toMinor(amount) <= 0) throw badRequest('INVALID_AMOUNT', 'Amount is too small.');

    this.state.sequence += 1;
    const purchase: Purchase = {
      id: `p${this.state.sequence}`,
      merchant: suggestion.merchant,
      amount,
      currency: plan.currency,
      ...(original ? { original } : {}),
      suggestedCategoryId,
      suggestion: { confidence: suggestion.confidence, reason: suggestion.reason },
      icon: suggestion.icon,
      splits: [],
      createdAt: this.now().toISOString(),
      coverage: [],
      uncovered: 0,
    };
    purchase.splits = normalizeSplits(
      purchase,
      [{ categoryId: request.categoryId ?? suggestedCategoryId, amount }],
      plan.categories,
    );
    this.state.purchases.push(purchase);
    return this.purchaseResult(purchase.id);
  }

  /** POST /purchases/:id/split: move all or part of a purchase between flexible jars. */
  split(id: string, body: unknown): Promise<PurchaseResult> {
    return this.exclusive(() => {
      const plan = this.requireActivePlan();
      const purchase = this.state.purchases.find((p) => p.id === id);
      if (!purchase) throw notFound('PURCHASE_NOT_FOUND', `Purchase ${id} not found in this month.`);
      const splits = (body as { splits?: unknown } | undefined)?.splits;
      purchase.splits = normalizeSplits(purchase, splits, plan.categories);
      return this.purchaseResult(id);
    });
  }

  /** POST /month-end: leftovers of flexible jars go to the cushion; the month is archived. */
  monthEnd(): Promise<MonthEndResult> {
    return this.exclusive(() => this.closeMonth());
  }

  private closeMonth(): MonthEndResult {
    const plan = this.requireActivePlan();
    const { state } = this;
    const ledger = applyLedger(plan, state.purchases);
    const result = summarizeMonthEnd({
      month: state.month,
      categories: ledger.categories,
      cushionBalance: state.cushionBalance,
      final: true,
      now: this.now(),
    });
    for (const purchase of ledger.purchases) {
      for (const split of purchase.splits) {
        state.history.push({
          id: `${purchase.id}_${split.categoryId}`,
          month: state.month,
          date: `${state.month}-${purchase.createdAt.slice(8, 10)}`,
          merchant: purchase.merchant,
          categoryId: split.categoryId,
          amount: split.amount,
        });
      }
    }
    state.cushionBalance = result.cushionAfter;
    state.lastMonthEnd = result;
    state.plan = { ...plan, status: 'closed' };
    state.phase = 'closed';
    return result;
  }

  /** GET /forecast: for the running month, or the next one after month end. */
  forecast(): Forecast {
    const month = this.state.phase === 'closed' ? addMonths(this.state.month, 1) : this.state.month;
    return this.buildForecastFor(month);
  }

  merchants(): MerchantInfo[] {
    return MERCHANTS;
  }

  /** GET /fx/quote: raw Wise quote, handy for checking the integration. */
  async quote(query: Record<string, unknown>): Promise<FxQuote> {
    const source = parseCurrency(query.source ?? PLAN_CURRENCY, 'source');
    const target = parseCurrency(query.target ?? 'EUR', 'target');
    const targetAmount = query.targetAmount != null ? Number(query.targetAmount) : undefined;
    const sourceAmount = query.sourceAmount != null ? Number(query.sourceAmount) : undefined;
    const amount = targetAmount ?? sourceAmount;
    if (amount == null) return this.fx.quote({ source, target, targetAmount: 800 });
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      throw badRequest('INVALID_AMOUNT', 'Amount must be a positive number.');
    }
    return this.fx.quote({ source, target, ...(targetAmount != null ? { targetAmount } : { sourceAmount }) });
  }

  private buildForecastFor(month: string): Forecast {
    const spentThisMonth: Record<string, number> = {};
    if (this.state.phase === 'active' && this.state.plan && this.state.month === month) {
      for (const c of this.categories()) spentThisMonth[c.id] = c.spent;
    }
    return buildForecast({
      month,
      currency: PLAN_CURRENCY,
      history: this.state.history,
      categories: FLEXIBLE_JARS,
      spentThisMonth,
    });
  }

  private currentPlan(): Plan {
    const plan = this.state.plan!;
    return { ...plan, categories: applyLedger(plan, this.state.purchases).categories };
  }

  private requireActivePlan(): Plan {
    if (this.state.phase !== 'active' || !this.state.plan) {
      throw conflict('NO_ACTIVE_PLAN', 'Approve a payday plan first (POST /payday, then POST /plan/approve).');
    }
    return this.state.plan;
  }

  private purchaseResult(id: string): PurchaseResult {
    const ledger = applyLedger(this.requireActivePlan(), this.state.purchases);
    return { purchase: ledger.purchases.find((p) => p.id === id)!, categories: ledger.categories };
  }

  /** Units of `currency` per 1 plan-currency unit, from the plan's Wise quotes or a fresh quote. */
  private async rateFor(plan: Plan, currency: string): Promise<number> {
    const fromPlan = plan.fxQuotes.find((q) => q.source === plan.currency && q.target === currency);
    if (fromPlan) return fromPlan.rate;
    const quote = await this.fx.quote({ source: plan.currency, target: currency, sourceAmount: 100 });
    return quote.rate;
  }
}

function computeTotals(categories: Category[]): Totals {
  const minor = (filter: (c: Category) => boolean, value: (c: Category) => number) =>
    fromMinor(sumMinor(categories.filter(filter).map((c) => toMinor(value(c)))));
  return {
    leftToSpend: minor((c) => c.type === 'flexible', (c) => Math.max(0, c.remaining)),
    reservedBills: minor((c) => c.type === 'fixed', (c) => Math.max(0, c.remaining)),
    cushionThisMonth: minor((c) => c.type === 'savings', (c) => c.allocated),
    spent: minor(() => true, (c) => c.spent),
    uncovered: minor(() => true, (c) => Math.max(0, -c.remaining)),
  };
}

interface ParsedPayday {
  amount: number;
  currency: string;
  savingsRate: number;
  overrides: Record<string, number>;
  refreshQuotes: boolean;
}

function parsePaydayRequest(body: unknown): ParsedPayday {
  const input = (body ?? {}) as Record<string, unknown>;
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw badRequest('INVALID_AMOUNT', 'Salary amount must be a positive number up to 1,000,000.');
  }
  const currency = parseCurrency(input.currency ?? PLAN_CURRENCY, 'currency');
  if (currency !== PLAN_CURRENCY) {
    throw badRequest('UNSUPPORTED_CURRENCY', `This PoC plans ${PLAN_CURRENCY} salaries (bills in EUR are converted with Wise).`);
  }

  const savingsRate = input.savingsRate ?? DEFAULT_SAVINGS_RATE;
  if (typeof savingsRate !== 'number' || !Number.isFinite(savingsRate) || savingsRate < 0 || savingsRate > MAX_SAVINGS_RATE) {
    throw badRequest('INVALID_SAVINGS_RATE', `savingsRate must be between 0 and ${MAX_SAVINGS_RATE}.`);
  }

  const overrides: Record<string, number> = {};
  if (input.overrides != null) {
    if (typeof input.overrides !== 'object' || Array.isArray(input.overrides)) {
      throw badRequest('INVALID_OVERRIDES', 'overrides must be an object like { "food": 250 }.');
    }
    for (const [categoryId, value] of Object.entries(input.overrides as Record<string, unknown>)) {
      if (!ADJUSTABLE_JARS.has(categoryId)) {
        throw badRequest('INVALID_OVERRIDES', `Only flexible jars can be adjusted (${[...ADJUSTABLE_JARS].join(', ')}).`);
      }
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > amount) {
        throw badRequest('INVALID_OVERRIDES', `Amount for ${categoryId} must be between 0 and the salary.`);
      }
      overrides[categoryId] = round2(value);
    }
  }

  return { amount: round2(amount), currency, savingsRate, overrides, refreshQuotes: input.refreshQuotes === true };
}

interface ParsedPurchase {
  merchant: string;
  amount: number;
  currency: string;
  categoryId?: string;
}

function parsePurchaseRequest(body: unknown, planCurrency: string): ParsedPurchase {
  const input = (body ?? {}) as Record<string, unknown>;
  const merchant = typeof input.merchant === 'string' ? input.merchant.trim() : '';
  if (!merchant || merchant.length > 60) {
    throw badRequest('INVALID_MERCHANT', 'merchant must be a non-empty string up to 60 characters.');
  }
  const amount = input.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || toMinor(amount) <= 0 || amount > 100_000) {
    throw badRequest('INVALID_AMOUNT', 'amount must be a positive number up to 100,000.');
  }
  const currency = parseCurrency(input.currency ?? planCurrency, 'currency');
  if (input.categoryId != null && typeof input.categoryId !== 'string') {
    throw badRequest('UNKNOWN_CATEGORY', 'categoryId must be a string.');
  }
  return { merchant, amount, currency, ...(input.categoryId ? { categoryId: input.categoryId as string } : {}) };
}

function parseCurrency(value: unknown, field: string): string {
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value)) {
    throw badRequest('INVALID_CURRENCY', `${field} must be a 3-letter currency code.`);
  }
  return value.toUpperCase();
}
