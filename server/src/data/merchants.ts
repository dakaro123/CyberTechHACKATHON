import type { MerchantInfo } from '../../../shared/types';

/** Merchant directory used to suggest a jar for each card payment (synthetic, Baltic merchants). */
export const MERCHANTS: MerchantInfo[] = [
  { name: 'Maxima', categoryId: 'food', icon: 'shopping_basket', kind: 'grocery store', confidence: 0.96, typicalAmount: 42.3 },
  { name: 'Rimi', categoryId: 'food', icon: 'shopping_basket', kind: 'grocery store', confidence: 0.95, typicalAmount: 27.8 },
  { name: 'Lidl', categoryId: 'food', icon: 'shopping_basket', kind: 'grocery store', confidence: 0.95, typicalAmount: 19.4 },
  { name: 'Wolt', categoryId: 'food', icon: 'delivery_dining', kind: 'food delivery app', confidence: 0.8, typicalAmount: 21.5 },
  { name: 'Bolt Food', categoryId: 'food', icon: 'delivery_dining', kind: 'food delivery app', confidence: 0.82, typicalAmount: 18.9 },
  { name: 'Circle K', categoryId: 'car', icon: 'local_gas_station', kind: 'fuel station', confidence: 0.86, typicalAmount: 54.2 },
  { name: 'Neste', categoryId: 'car', icon: 'local_gas_station', kind: 'fuel station', confidence: 0.9, typicalAmount: 48.9 },
  { name: 'Bolt', categoryId: 'car', icon: 'local_taxi', kind: 'ride-hailing app', confidence: 0.72, typicalAmount: 9.6 },
  { name: 'EuroPark', categoryId: 'car', icon: 'local_parking', kind: 'parking operator', confidence: 0.94, typicalAmount: 3.5 },
  { name: 'Netflix', categoryId: 'free', icon: 'movie', kind: 'streaming service', confidence: 0.92, typicalAmount: 12.99 },
  { name: 'Spotify', categoryId: 'free', icon: 'graphic_eq', kind: 'music streaming service', confidence: 0.92, typicalAmount: 11.99 },
  { name: 'Forum Cinemas', categoryId: 'free', icon: 'theaters', kind: 'cinema', confidence: 0.9, typicalAmount: 11.5 },
  { name: 'Lido', categoryId: 'free', icon: 'restaurant', kind: 'restaurant', confidence: 0.78, typicalAmount: 24.6 },
  { name: 'H&M', categoryId: 'free', icon: 'checkroom', kind: 'clothing store', confidence: 0.85, typicalAmount: 39.99 },
  { name: 'Elektrum', categoryId: 'utilities', icon: 'bolt', kind: 'electricity provider', confidence: 0.97, typicalAmount: 64.2 },
  { name: 'Telia', categoryId: 'utilities', icon: 'phone_iphone', kind: 'mobile operator', confidence: 0.97, typicalAmount: 24.99 },
  { name: 'Bite', categoryId: 'utilities', icon: 'wifi', kind: 'internet provider', confidence: 0.95, typicalAmount: 19.99 },
  { name: 'Landlord', categoryId: 'rent', icon: 'home', kind: 'landlord', confidence: 0.99, typicalAmount: 800 },
];

const KEYWORD_RULES: Array<{ pattern: RegExp; categoryId: string; icon: string; label: string }> = [
  { pattern: /grocer|market|supermarket|bakery|butcher/, categoryId: 'food', icon: 'shopping_basket', label: 'a grocery purchase' },
  { pattern: /fuel|petrol|parking|car ?wash|garage|tyre|tire/, categoryId: 'car', icon: 'directions_car', label: 'a car expense' },
  { pattern: /cafe|coffee|restaurant|bistro|pizza|bar\b|pub\b|cinema|theatre|concert/, categoryId: 'free', icon: 'local_cafe', label: 'eating out or fun' },
];

export interface Suggestion {
  merchant: string;
  categoryId: string;
  confidence: number;
  reason: string;
  icon: string;
}

const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, ' ').trim();
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const BY_LONGEST_NAME = [...MERCHANTS].sort((a, b) => b.name.length - a.name.length);

export function suggestCategory(merchantInput: string): Suggestion {
  const query = normalize(merchantInput);
  const match = BY_LONGEST_NAME.find((m) => new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalize(m.name))}($|[^a-z0-9])`).test(query));
  if (match) {
    return {
      merchant: match.name,
      categoryId: match.categoryId,
      confidence: match.confidence,
      reason: `${match.name} is a ${match.kind}`,
      icon: match.icon,
    };
  }

  const display = merchantInput.trim().replace(/\s+/g, ' ');
  const rule = KEYWORD_RULES.find((r) => r.pattern.test(query));
  if (rule) {
    return { merchant: display, categoryId: rule.categoryId, confidence: 0.6, reason: `Looks like ${rule.label}`, icon: rule.icon };
  }
  return { merchant: display, categoryId: 'free', confidence: 0.4, reason: 'Unknown merchant, parked in Free Money', icon: 'storefront' };
}
