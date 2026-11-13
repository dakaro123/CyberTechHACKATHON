import type { HistoryEntry } from '../engine/forecast';
import { round2 } from '../engine/money';
import { previousMonths } from '../engine/months';

/**
 * Synthetic 3-month card history for the demo persona: paid in GBP, living in the Baltics (EUR).
 * Deterministic (seeded), so forecasts are stable between runs.
 */
interface Pattern {
  merchant: string;
  categoryId: string;
  visits: [number, number];
  amount: [number, number];
  day?: number;
}

const MONTHLY_PATTERN: Pattern[] = [
  { merchant: 'Maxima', categoryId: 'food', visits: [5, 6], amount: [18, 40] },
  { merchant: 'Rimi', categoryId: 'food', visits: [3, 4], amount: [14, 34] },
  { merchant: 'Lidl', categoryId: 'food', visits: [2, 3], amount: [10, 26] },
  { merchant: 'Wolt', categoryId: 'food', visits: [1, 2], amount: [15, 27] },
  { merchant: 'Circle K', categoryId: 'car', visits: [2, 2], amount: [42, 60] },
  { merchant: 'Neste', categoryId: 'car', visits: [1, 1], amount: [38, 55] },
  { merchant: 'EuroPark', categoryId: 'car', visits: [2, 4], amount: [2, 6] },
  { merchant: 'Bolt', categoryId: 'car', visits: [1, 3], amount: [6, 14] },
  { merchant: 'Netflix', categoryId: 'free', visits: [1, 1], amount: [12.99, 12.99], day: 5 },
  { merchant: 'Spotify', categoryId: 'free', visits: [1, 1], amount: [11.99, 11.99], day: 12 },
  { merchant: 'Forum Cinemas', categoryId: 'free', visits: [0, 2], amount: [9, 12] },
  { merchant: 'Lido', categoryId: 'free', visits: [2, 3], amount: [14, 32] },
  { merchant: 'H&M', categoryId: 'free', visits: [0, 1], amount: [25, 60] },
  { merchant: 'Elektrum', categoryId: 'utilities', visits: [1, 1], amount: [58, 82], day: 10 },
  { merchant: 'Telia', categoryId: 'utilities', visits: [1, 1], amount: [24.99, 24.99], day: 15 },
  { merchant: 'Bite', categoryId: 'utilities', visits: [1, 1], amount: [19.99, 19.99], day: 15 },
  { merchant: 'Landlord', categoryId: 'rent', visits: [1, 1], amount: [800, 800], day: 1 },
];

/** Approximate GBP→EUR rates for the three history months, oldest first. */
const MONTH_RATES = [1.176, 1.183, 1.191];

export function generateHistory(currentMonth: string, seed = 2026): HistoryEntry[] {
  const random = mulberry32(seed);
  const between = ([min, max]: [number, number]) => min + (max - min) * random();
  const entries: HistoryEntry[] = [];

  previousMonths(currentMonth, MONTH_RATES.length).forEach((month, index) => {
    const rate = MONTH_RATES[index];
    for (const pattern of MONTHLY_PATTERN) {
      const visits = Math.round(between(pattern.visits));
      for (let visit = 0; visit < visits; visit += 1) {
        const eur = round2(between(pattern.amount));
        const day = pattern.day ?? 1 + Math.floor(random() * 28);
        entries.push({
          id: `h_${month}_${entries.length}`,
          month,
          date: `${month}-${String(day).padStart(2, '0')}`,
          merchant: pattern.merchant,
          categoryId: pattern.categoryId,
          amount: round2(eur / rate),
          original: { amount: eur, currency: 'EUR', rate },
        });
      }
    }
  });

  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
