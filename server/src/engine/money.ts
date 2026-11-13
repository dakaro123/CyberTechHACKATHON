/** Money helpers. The engine works in integer minor units (pence) to avoid float drift. */

export function toMinor(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 100 + 1e-7);
}

export function fromMinor(minor: number): number {
  return minor / 100;
}

export function round2(value: number): number {
  return fromMinor(toMinor(value));
}

export function sumMinor(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

export function formatMoney(value: number, currency: string): string {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(value);
}
