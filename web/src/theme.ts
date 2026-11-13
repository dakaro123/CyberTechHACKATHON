import type { CategoryType } from '../../shared/types';

export interface JarStyle {
  /** Progress bar / allocation colour. */
  bar: string;
  /** Icon circle background. */
  bg: string;
  /** Icon colour. */
  fg: string;
}

const JAR_STYLES: Record<string, JarStyle> = {
  rent: { bar: '#163300', bg: '#16330024', fg: '#163300' },
  utilities: { bar: '#5a5f5f', bg: '#5a5f5f24', fg: '#434848' },
  cushion: { bar: '#2f6c00', bg: '#c5eba3', fg: '#0c2000' },
  food: { bar: '#9fe870', bg: '#9fe8706b', fg: '#225100' },
  car: { bar: '#7fd4d4', bg: '#a0e1e18c', fg: '#0b4f4f' },
  free: { bar: '#ffb27a', bg: '#ffc0918c', fg: '#7a3300' },
};

const FALLBACK: JarStyle = { bar: '#c1cab5', bg: '#e7e8e6', fg: '#41493a' };

export const jarStyle = (categoryId: string): JarStyle => JAR_STYLES[categoryId] ?? FALLBACK;

export const TYPE_LABELS: Record<CategoryType, { emoji: string; label: string; caption: string }> = {
  fixed: { emoji: '🔒', label: 'Fixed', caption: 'Paid first. Never used to cover overspends.' },
  savings: { emoji: '🛡', label: 'Savings', caption: 'Saved before spending. Never touched.' },
  flexible: { emoji: '🔄', label: 'Flexible', caption: 'Overspends are covered here: Free Money first.' },
};
