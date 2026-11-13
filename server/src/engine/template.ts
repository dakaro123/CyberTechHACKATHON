import type { CategoryType } from '../../../shared/types';

export interface CategoryTemplate {
  id: string;
  name: string;
  type: CategoryType;
  /** Material Symbols icon name. */
  icon: string;
  /** Fixed bill in its own currency; converted with a Wise quote when it differs from the salary currency. */
  bill?: { currency: string; amount: number };
  /** Planned amount for a flexible jar when there is no spending history. */
  defaultAmount?: number;
  /** Receives whatever is left after every other jar (Free Money). */
  remainder?: boolean;
}

export const PLAN_CURRENCY = 'GBP';
export const DEFAULT_SALARY = 2000;
export const EMPLOYER = 'ACME Ltd';
export const STARTING_CUSHION = 1250;
export const DEFAULT_SAVINGS_RATE = 0.1;
export const MAX_SAVINGS_RATE = 0.5;
export const FREE_MONEY_ID = 'free';

/** Order matters: fixed bills are funded first, then savings, then flexible jars. */
export const CATEGORY_TEMPLATE: CategoryTemplate[] = [
  { id: 'rent', name: 'Rent', type: 'fixed', icon: 'home', bill: { currency: 'EUR', amount: 800 } },
  { id: 'utilities', name: 'Utilities', type: 'fixed', icon: 'bolt', bill: { currency: 'EUR', amount: 140 } },
  { id: 'cushion', name: 'Safety cushion', type: 'savings', icon: 'savings' },
  { id: 'food', name: 'Food', type: 'flexible', icon: 'shopping_basket', defaultAmount: 280 },
  { id: 'car', name: 'Car', type: 'flexible', icon: 'directions_car', defaultAmount: 150 },
  { id: FREE_MONEY_ID, name: 'Free Money', type: 'flexible', icon: 'celebration', remainder: true },
];
