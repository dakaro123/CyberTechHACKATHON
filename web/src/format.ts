const formatters = new Map<string, Intl.NumberFormat>();

export function money(value: number, currency = 'GBP', decimals = 2): string {
  const key = `${currency}:${decimals}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
    formatters.set(key, formatter);
  }
  return formatter.format(Object.is(value, -0) ? 0 : value);
}

/** Whole units when the value is round, pennies otherwise: £280 vs £35.32. */
export function moneyShort(value: number, currency = 'GBP'): string {
  return money(value, currency, Number.isInteger(Math.round(value * 100) / 100) ? 0 : 2);
}

export function monthName(month: string, style: 'long' | 'short' = 'long'): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString('en-GB', { month: style, timeZone: 'UTC' });
}

export function nextMonth(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function timeAgo(iso: string): string {
  const seconds = (Date.now() - Date.parse(iso)) / 1000;
  if (seconds < 45) return 'Just now';
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)} h ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export const round2 = (value: number) => Math.round(value * 100) / 100;
