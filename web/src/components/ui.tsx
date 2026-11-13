import { useId, type ButtonHTMLAttributes, type CSSProperties, type ReactNode } from 'react';
import type { Category, CategoryType } from '../../../shared/types';
import { jarStyle, TYPE_LABELS } from '../theme';

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

export function Icon({
  name,
  className,
  filled,
  bold,
  style,
}: {
  name: string;
  className?: string;
  filled?: boolean;
  bold?: boolean;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden="true"
      style={style}
      className={cx('material-symbols-outlined leading-none', filled && 'icon-filled', bold && 'icon-bold', className)}
    >
      {name}
    </span>
  );
}

type TagTone = 'neutral' | 'lime' | 'dark' | 'success' | 'danger' | 'warn';

const TAG_TONES: Record<TagTone, string> = {
  neutral: 'bg-surface-container text-on-surface-variant',
  lime: 'bg-primary-container text-on-primary-fixed',
  dark: 'bg-inverse-surface text-inverse-on-surface',
  success: 'bg-secondary-container text-on-secondary-fixed',
  danger: 'bg-error-container text-on-error-container',
  warn: 'bg-[#ffeb99] text-[#4a3b00]',
};

export function Tag({ children, tone = 'neutral', icon, className }: { children: ReactNode; tone?: TagTone; icon?: string; className?: string }) {
  return (
    <span
      className={cx(
        'inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-0.5 font-currency-tag text-currency-tag uppercase tracking-wider',
        TAG_TONES[tone],
        className,
      )}
    >
      {icon && <Icon name={icon} filled className="text-[14px]" />}
      {children}
    </span>
  );
}

export function TypeTag({ type }: { type: CategoryType }) {
  const { emoji, label } = TYPE_LABELS[type];
  const tone: TagTone = type === 'fixed' ? 'dark' : type === 'savings' ? 'success' : 'neutral';
  return (
    <Tag tone={tone}>
      <span className="text-[10px] normal-case">{emoji}</span>
      {label}
    </Tag>
  );
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-lg bg-surface-container-lowest p-5 shadow-sm', className)}>{children}</div>;
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { icon?: string; size?: 'md' | 'lg' };

export function PrimaryButton({ children, className, icon, size = 'lg', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary-container font-label-bold text-on-primary-fixed transition active:scale-[0.98] enabled:hover:brightness-95 disabled:opacity-50',
        size === 'lg' ? 'h-14 text-[16px]' : 'h-11 text-label-bold',
        className,
      )}
    >
      {icon && <Icon name={icon} bold className="text-[20px]" />}
      {children}
    </button>
  );
}

export function SecondaryButton({ children, className, icon, size = 'lg', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={cx(
        'inline-flex w-full items-center justify-center gap-2 rounded-full bg-surface-container-highest font-label-bold text-on-surface transition active:scale-[0.98] enabled:hover:bg-surface-variant disabled:opacity-50',
        size === 'lg' ? 'h-14 text-[16px]' : 'h-11 text-label-bold',
        className,
      )}
    >
      {icon && <Icon name={icon} className="text-[20px]" />}
      {children}
    </button>
  );
}

export function TextButton({ children, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className={cx('inline-flex items-center gap-1 font-label-bold text-label-bold text-primary hover:underline disabled:opacity-50', className)}
    >
      {children}
    </button>
  );
}

export function RoundAction({
  icon,
  label,
  primary,
  onClick,
}: {
  icon: string;
  label: string;
  primary?: boolean;
  onClick(): void;
}) {
  return (
    <button type="button" onClick={onClick} className="group flex flex-col items-center gap-1.5 transition-transform active:scale-95">
      <span
        className={cx(
          'flex h-14 w-14 items-center justify-center rounded-full transition',
          primary
            ? 'bg-primary-container text-on-primary-fixed shadow-sm group-hover:opacity-90'
            : 'bg-surface-container-highest text-on-surface group-hover:bg-surface-variant',
        )}
      >
        <Icon name={icon} bold={primary} className="text-[26px]" />
      </span>
      <span className="font-label-bold text-label-bold text-on-surface">{label}</span>
    </button>
  );
}

export function ProgressBar({ value, color, over }: { value: number; color: string; over?: boolean }) {
  const width = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-container-high">
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${over ? 100 : width}%`, background: over ? '#ba1a1a' : color }}
      />
    </div>
  );
}

export function JarIcon({ category, size = 'md' }: { category: Pick<Category, 'id' | 'icon'>; size?: 'sm' | 'md' | 'lg' }) {
  const style = jarStyle(category.id);
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-12 w-12' : 'h-10 w-10';
  const text = size === 'sm' ? 'text-[18px]' : size === 'lg' ? 'text-[24px]' : 'text-[20px]';
  return (
    <span className={cx('flex shrink-0 items-center justify-center rounded-full', box)} style={{ background: style.bg, color: style.fg }}>
      <Icon name={category.icon} className={text} />
    </span>
  );
}

type BannerTone = 'success' | 'danger' | 'warn' | 'info';

const BANNER_TONES: Record<BannerTone, string> = {
  success: 'bg-secondary-container text-on-secondary-fixed',
  danger: 'bg-error-container text-on-error-container',
  warn: 'bg-[#fff4c2] text-[#4a3b00]',
  info: 'bg-surface-container text-on-surface-variant',
};

export function Banner({ tone = 'info', icon, title, children }: { tone?: BannerTone; icon?: string; title?: ReactNode; children?: ReactNode }) {
  return (
    <div className={cx('flex items-start gap-3 rounded p-4', BANNER_TONES[tone])}>
      {icon && <Icon name={icon} filled className="mt-0.5 text-[20px]" />}
      <div className="flex min-w-0 flex-col gap-0.5">
        {title && <span className="font-label-bold text-label-bold">{title}</span>}
        {children && <span className="font-body-sm text-body-sm">{children}</span>}
      </div>
    </div>
  );
}

export function SectionTitle({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="font-title-sm text-title-sm text-on-surface">{title}</h2>
      {action}
    </div>
  );
}

export function ScreenTitle({ tag, title, subtitle }: { tag?: ReactNode; title: ReactNode; subtitle?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      {tag}
      <h1 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface">{title}</h1>
      {subtitle && <p className="font-body-md text-body-md text-on-surface-variant">{subtitle}</p>}
    </div>
  );
}

export function Chip({ selected, children, onClick, icon }: { selected?: boolean; children: ReactNode; onClick(): void; icon?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 font-label-bold text-label-bold transition-transform active:scale-95',
        selected ? 'bg-inverse-surface text-inverse-on-surface' : 'bg-surface-container-high text-on-surface-variant hover:bg-surface-variant',
      )}
    >
      {icon && <Icon name={icon} className="text-[16px]" />}
      {children}
    </button>
  );
}

export function Stat({ label, value, highlight }: { label: string; value: ReactNode; highlight?: boolean }) {
  return (
    <div
      className={cx(
        'flex flex-col gap-1 rounded p-3 text-left',
        highlight ? 'bg-primary-container text-on-primary-fixed' : 'bg-surface-container-lowest text-on-surface shadow-sm',
      )}
    >
      <span className="font-currency-tag text-currency-tag uppercase tracking-wider opacity-80">{label}</span>
      <span className="tabular font-label-bold text-[15px]">{value}</span>
    </div>
  );
}

/** Round currency flag (SVG, so it renders on Windows too where flag emoji don't). */
export function Flag({ currency, className }: { currency: string; className?: string }) {
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const box = cx('inline-flex h-5 w-5 shrink-0 overflow-hidden rounded-full ring-1 ring-black/10', className);
  if (currency === 'GBP') {
    return (
      <span className={box} aria-hidden="true">
        <svg viewBox="15 0 30 30" className="h-full w-full">
          <clipPath id={`${id}t`}>
            <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
          </clipPath>
          <path d="M0,0 v30 h60 v-30 z" fill="#012169" />
          <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
          <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="4" />
          <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
          <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
        </svg>
      </span>
    );
  }
  if (currency === 'EUR') {
    return (
      <span className={box} aria-hidden="true">
        <svg viewBox="0 0 20 20" className="h-full w-full">
          <rect width="20" height="20" fill="#003399" />
          {Array.from({ length: 12 }, (_, index) => {
            const angle = (index * Math.PI) / 6;
            return <circle key={index} cx={10 + 6 * Math.sin(angle)} cy={10 - 6 * Math.cos(angle)} r="1.1" fill="#FFCC00" />;
          })}
        </svg>
      </span>
    );
  }
  return <span className="font-currency-tag text-currency-tag">{currency}</span>;
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cx('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-r-transparent', className)} />;
}
