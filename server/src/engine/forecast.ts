import type { CategoryForecast, Forecast } from '../../../shared/types';
import { fromMinor, sumMinor, toMinor } from './money';
import { previousMonths } from './months';

export const FORECAST_MONTHS = 3;
export const FORECAST_BUFFER = 0.05;

export interface HistoryEntry {
  id: string;
  /** YYYY-MM */
  month: string;
  /** YYYY-MM-DD */
  date: string;
  merchant: string;
  categoryId: string;
  /** Amount in the plan currency. */
  amount: number;
  original?: { amount: number; currency: string; rate: number };
}

export interface ForecastInput {
  /** Month to forecast (YYYY-MM); the 3 months before it are used. */
  month: string;
  currency: string;
  history: HistoryEntry[];
  categories: Array<{ id: string; name: string; icon: string }>;
  spentThisMonth?: Record<string, number>;
}

/** Forecast = 3-month moving average + 5% buffer, rounded to the nearest 5. */
export function buildForecast(input: ForecastInput): Forecast {
  const historyMonths = previousMonths(input.month, FORECAST_MONTHS);
  const monthsWithData = historyMonths.filter((month) => input.history.some((entry) => entry.month === month));

  const categories: CategoryForecast[] = input.categories.map((category) => {
    const history = historyMonths.map((month) => ({
      month,
      spent: fromMinor(
        sumMinor(
          input.history
            .filter((entry) => entry.month === month && entry.categoryId === category.id)
            .map((entry) => toMinor(entry.amount)),
        ),
      ),
    }));
    const total = sumMinor(history.filter((h) => monthsWithData.includes(h.month)).map((h) => toMinor(h.spent)));
    const average = monthsWithData.length ? fromMinor(total) / monthsWithData.length : 0;
    return {
      categoryId: category.id,
      name: category.name,
      icon: category.icon,
      history,
      usually: Math.round(average),
      forecast: roundTo5(average * (1 + FORECAST_BUFFER)),
      spentThisMonth: input.spentThisMonth?.[category.id] ?? 0,
    };
  });

  return {
    currency: input.currency,
    method: '3-month moving average + 5% buffer, rounded to 5',
    month: input.month,
    historyMonths,
    categories,
  };
}

function roundTo5(value: number): number {
  return Math.round(value / 5) * 5;
}
