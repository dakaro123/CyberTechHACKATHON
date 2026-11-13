/**
 * Wise Flow API contract, shared by the server and the web app.
 * All money values are in major units (e.g. pounds) rounded to 2 decimals.
 * Unless stated otherwise, amounts are in the plan currency (the salary currency).
 */

export type CurrencyCode = string;
export type CategoryType = 'fixed' | 'flexible' | 'savings';
export type Phase = 'awaiting-payday' | 'draft' | 'active' | 'closed';

export interface FxQuote {
  id: string;
  /** Category this conversion funds (e.g. rent). */
  categoryId?: string;
  source: CurrencyCode;
  target: CurrencyCode;
  /** 1 unit of source = `rate` units of target. */
  rate: number;
  /** What it costs in the source currency, Wise fee included. */
  sourceAmount: number;
  targetAmount: number;
  /** Wise fee in the source currency. */
  fee: number;
  provider: 'wise' | 'wise-sandbox' | 'fallback';
  /** false when the Wise API was unreachable and a cached/static rate was used. */
  live: boolean;
  fetchedAt: string;
  expiresAt?: string;
  note?: string;
}

export interface Category {
  id: string;
  name: string;
  type: CategoryType;
  currency: CurrencyCode;
  allocated: number;
  spent: number;
  icon: string;
  /** allocated + coveredIn - coveredOut - spent. Negative only when an overspend could not be covered. */
  remaining: number;
  /** Overspend covered by other (flexible) categories. */
  coveredIn: number;
  /** Money this category gave away to cover overspends elsewhere. */
  coveredOut: number;
  /** Fixed bills and savings are locked: never used to cover overspends. */
  locked: boolean;
  /** Original bill for fixed categories paid in another currency, e.g. rent EUR 800. */
  bill?: { currency: CurrencyCode; amount: number; quoteId?: string };
  /** Forecast (3-month moving average + 5%), used as the planned amount for flexible jars. */
  forecast?: number;
  /** What you usually spend per month (3-month average). */
  usually?: number;
  /** How much of a fixed bill the salary could not cover. */
  shortfall?: number;
}

export type PlanWarningCode = 'SALARY_BELOW_FIXED' | 'SAVINGS_REDUCED' | 'FLEXIBLE_SCALED' | 'FX_FALLBACK';

export interface PlanWarning {
  code: PlanWarningCode;
  message: string;
}

export interface Plan {
  id: string;
  /** YYYY-MM */
  month: string;
  status: 'draft' | 'active' | 'closed';
  salary: number;
  currency: CurrencyCode;
  savingsRate: number;
  categories: Category[];
  fxQuotes: FxQuote[];
  warnings: PlanWarning[];
  createdAt: string;
  approvedAt?: string;
}

export interface Split {
  categoryId: string;
  amount: number;
}

export interface Coverage {
  fromCategoryId: string;
  toCategoryId: string;
  amount: number;
}

export interface Purchase {
  id: string;
  merchant: string;
  /** Amount in the plan currency. */
  amount: number;
  currency: CurrencyCode;
  /** Set when the card payment happened in another currency (e.g. EUR at Maxima). */
  original?: { amount: number; currency: CurrencyCode; rate: number };
  suggestedCategoryId: string;
  suggestion: { confidence: number; reason: string };
  icon: string;
  splits: Split[];
  createdAt: string;
  /** Overspend this purchase caused and where the money came from. */
  coverage: Coverage[];
  /** Overspend nobody could cover (all flexible jars empty). */
  uncovered: number;
}

export interface PaydayRequest {
  amount: number;
  currency?: CurrencyCode;
  /** Share of salary for the safety cushion, 0..0.5. Default 0.1. */
  savingsRate?: number;
  /** Planned amounts for flexible jars (except Free Money), keyed by category id. */
  overrides?: Record<string, number>;
  /** Force fresh Wise quotes instead of reusing the draft's quotes. */
  refreshQuotes?: boolean;
}

export interface PurchaseRequest {
  merchant: string;
  amount: number;
  currency?: CurrencyCode;
  /** Optional manual category instead of the suggestion. */
  categoryId?: string;
}

export interface SplitRequest {
  splits: Split[];
}

export interface PurchaseResult {
  purchase: Purchase;
  categories: Category[];
}

export interface MonthEndSweep {
  categoryId: string;
  name: string;
  amount: number;
}

export interface MonthEndResult {
  month: string;
  /** Leftovers of flexible jars swept into the cushion. */
  saved: number;
  sweeps: MonthEndSweep[];
  /** Cushion allocation from the payday plan. */
  plannedSavings: number;
  cushionBefore: number;
  cushionAfter: number;
  spent: number;
  uncovered: number;
  /** false = preview of what closing the month would do. */
  final: boolean;
  closedAt?: string;
}

export interface CategoryForecast {
  categoryId: string;
  name: string;
  icon: string;
  history: { month: string; spent: number }[];
  /** 3-month moving average. */
  usually: number;
  /** usually + 5%, rounded to 5. */
  forecast: number;
  spentThisMonth: number;
}

export interface Forecast {
  currency: CurrencyCode;
  method: string;
  /** Month the forecast is for (YYYY-MM). */
  month: string;
  historyMonths: string[];
  categories: CategoryForecast[];
}

export interface MerchantInfo {
  name: string;
  categoryId: string;
  icon: string;
  kind: string;
  confidence: number;
  /** Typical ticket in EUR, used for quick demo buttons. */
  typicalAmount: number;
}

export interface Totals {
  /** Remaining money in flexible jars. */
  leftToSpend: number;
  /** Money locked for fixed bills. */
  reservedBills: number;
  /** Cushion allocation for this month. */
  cushionThisMonth: number;
  spent: number;
  uncovered: number;
}

export interface Bill {
  categoryId: string;
  name: string;
  currency: CurrencyCode;
  amount: number;
}

export interface AppState {
  phase: Phase;
  month: string;
  currency: CurrencyCode;
  defaultSalary: number;
  defaultSavingsRate: number;
  employer: string;
  /** Fixed bills from the plan template, e.g. rent EUR 800. */
  bills: Bill[];
  plan: Plan | null;
  purchases: Purchase[];
  /** Cushion saved in previous months. */
  cushionBalance: number;
  /** Preview while the month is active, final result after month end. */
  monthEnd: MonthEndResult | null;
  fx: FxQuote | null;
  totals: Totals;
}

export interface ApiErrorBody {
  error: { code: string; message: string };
}
