import { useState, type ReactNode } from 'react';
import type { AppState, Category, CategoryType, FxQuote, Plan, PlanWarningCode } from '../../../shared/types';
import {
  Banner,
  Card,
  Chip,
  Flag,
  Icon,
  JarIcon,
  PrimaryButton,
  ProgressBar,
  ScreenTitle,
  Spinner,
  Stat,
  Tag,
  TextButton,
} from '../components/ui';
import { clockTime, money, monthName, nextMonth, round2, shortDate } from '../format';
import { useLoadedStore } from '../store';
import { coverageDonors } from '../selectors';
import { jarStyle, TYPE_LABELS } from '../theme';

const SAVINGS_RATES = [0.05, 0.1, 0.15, 0.2];
const TYPES: CategoryType[] = ['fixed', 'savings', 'flexible'];

const WARNING_TITLES: Record<PlanWarningCode, string> = {
  SALARY_BELOW_FIXED: 'Salary does not cover fixed bills',
  SAVINGS_REDUCED: 'Cushion reduced',
  FLEXIBLE_SCALED: 'Tight month',
  FX_FALLBACK: 'Wise API unreachable',
};

export function PlanScreen() {
  const { state } = useLoadedStore();
  if (state.phase === 'draft' && state.plan) return <DraftPlan plan={state.plan} state={state} />;
  if (state.phase === 'active' && state.plan) return <ActivePlan plan={state.plan} state={state} />;
  return <PaydayForm state={state} />;
}

function PaydayForm({ state }: { state: AppState }) {
  const { actions, busy } = useLoadedStore();
  const [amount, setAmount] = useState(String(state.defaultSalary));
  const [savingsRate, setSavingsRate] = useState(state.defaultSavingsRate);
  const month = state.phase === 'closed' ? nextMonth(state.month) : state.month;
  const value = Number(amount.replace(',', '.'));
  const valid = Number.isFinite(value) && value > 0 && value <= 1_000_000;
  const bills = state.bills.map((b) => `${b.name.toLowerCase()} ${money(b.amount, b.currency, 0)}`).join(' and ');

  const submit = () => {
    if (valid && !busy) void actions.payday({ amount: value, currency: state.currency, savingsRate, refreshQuotes: true });
  };

  return (
    <div className="flex flex-col gap-space-lg px-margin pb-8 pt-space-md">
      {state.phase === 'closed' && state.monthEnd && (
        <Banner tone="success" icon="savings" title={`${monthName(state.month)} closed`}>
          You saved {money(state.monthEnd.saved)}. Ready for the next payday.
        </Banner>
      )}
      <ScreenTitle
        tag={
          <Tag tone="lime" icon="bolt">
            Payday
          </Tag>
        }
        title={`Your ${monthName(month)} salary landed`}
        subtitle="We split it into jars before you spend a penny. Nothing moves until you approve."
      />

      <Card className="flex flex-col gap-3">
        <label htmlFor="salary" className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface-variant">
          You received
        </label>
        <div className="flex items-center gap-3">
          <span className="inline-flex shrink-0 items-center gap-2 rounded-full bg-surface-container px-3 py-2">
            <Flag currency={state.currency} />
            <span className="font-label-bold text-label-bold">{state.currency}</span>
          </span>
          <input
            id="salary"
            inputMode="decimal"
            autoComplete="off"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && submit()}
            className="tabular min-w-0 flex-1 bg-transparent text-right font-balance-numeral text-balance-numeral text-on-surface outline-none"
          />
        </div>
        <div className="flex items-center gap-2 font-body-sm text-body-sm text-on-surface-variant">
          <Icon name="south_west" className="text-[16px] text-primary" />
          From {state.employer} · Salary
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <h2 className="font-title-sm text-title-sm">How Wise Flow splits it</h2>
        <RuleStep emoji="🔒" title="1. Fixed bills first" text={`${capitalize(bills)}, converted at the live Wise rate.`} />
        <RuleStep emoji="🛡" title="2. Safety cushion" text={`${Math.round(savingsRate * 100)}% of salary is saved before any spending.`}>
          <div className="mt-2 flex flex-wrap gap-2">
            {SAVINGS_RATES.map((rate) => (
              <Chip key={rate} selected={rate === savingsRate} onClick={() => setSavingsRate(rate)}>
                {Math.round(rate * 100)}%
              </Chip>
            ))}
          </div>
        </RuleStep>
        <RuleStep emoji="🔄" title="3. Flexible jars" text="Food and Car from your 3-month history (+5% buffer). The rest is Free Money." />
      </Card>

      <PrimaryButton disabled={!valid || busy} onClick={submit} icon={busy ? undefined : 'auto_awesome'}>
        {busy ? (
          <>
            <Spinner /> Getting a Wise quote…
          </>
        ) : (
          'Build my plan'
        )}
      </PrimaryButton>
    </div>
  );
}

function RuleStep({ emoji, title, text, children }: { emoji: string; title: string; text: string; children?: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-base">{emoji}</span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="font-label-bold text-label-bold text-on-surface">{title}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{text}</span>
        {children}
      </div>
    </div>
  );
}

function DraftPlan({ plan, state }: { plan: Plan; state: AppState }) {
  const { actions, busy } = useLoadedStore();
  const adjustable = plan.categories.filter((c) => c.type === 'flexible' && c.id !== 'free');
  const free = plan.categories.find((c) => c.id === 'free');

  const rebuild = (changes: { overrides?: Record<string, number>; savingsRate?: number; refreshQuotes?: boolean }) =>
    actions.payday({
      amount: plan.salary,
      currency: plan.currency,
      savingsRate: changes.savingsRate ?? plan.savingsRate,
      overrides: { ...Object.fromEntries(adjustable.map((c) => [c.id, c.allocated])), ...changes.overrides },
      refreshQuotes: changes.refreshQuotes,
    });

  const step = (category: Category, direction: 1 | -1) => {
    const next = direction > 0 ? Math.floor(category.allocated / 10) * 10 + 10 : Math.ceil(category.allocated / 10) * 10 - 10;
    void rebuild({ overrides: { [category.id]: Math.max(0, next) } });
  };

  const subtitle = (c: Category): ReactNode => {
    if (c.type === 'fixed') {
      const quote = plan.fxQuotes.find((q) => q.categoryId === c.id);
      if (c.shortfall) return <span className="text-error">Short by {money(c.shortfall, c.currency)}</span>;
      if (c.bill && quote) return `${money(c.bill.amount, c.bill.currency)} at ${quote.rate.toFixed(4)} · fee ${money(quote.fee, quote.source)}`;
      return 'Fixed bill';
    }
    if (c.type === 'savings') return `${Math.round(plan.savingsRate * 100)}% of salary · total ${money(state.cushionBalance + c.allocated, c.currency)}`;
    if (c.id === 'free') return 'Whatever is left. Spend it guilt-free';
    return c.usually ? `Usually ${money(c.usually, c.currency, 0)} · forecast +5%` : 'Your budget';
  };

  return (
    <div className="flex flex-col gap-space-lg px-margin pt-space-md">
      <ScreenTitle
        tag={
          <Tag tone="warn" icon="pending">
            Draft
          </Tag>
        }
        title={`${monthName(plan.month)} plan`}
        subtitle={`${money(plan.salary, plan.currency)} from ${state.employer}, split by the rules: fixed, then savings, then flexible.`}
      />
      <AllocationBar plan={plan} />
      {plan.warnings.map((warning) => (
        <Banner key={warning.code} tone={warning.code === 'FX_FALLBACK' ? 'warn' : 'danger'} icon="warning" title={WARNING_TITLES[warning.code]}>
          {warning.message}
        </Banner>
      ))}
      <FxCard quotes={plan.fxQuotes} categories={plan.categories} busy={busy} onRefresh={() => void rebuild({ refreshQuotes: true })} />

      {TYPES.map((type) => (
        <PlanGroup key={type} type={type}>
          {plan.categories
            .filter((c) => c.type === type)
            .map((c) => (
              <div key={c.id} className="flex flex-col gap-2 p-4">
                <div className="flex items-center gap-3">
                  <JarIcon category={c} />
                  <div className="min-w-0 flex-1">
                    <div className="font-label-bold text-label-bold text-on-surface">{c.name}</div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">{subtitle(c)}</div>
                  </div>
                  {adjustable.includes(c) && (
                    <div className="flex items-center gap-1">
                      <StepButton icon="remove" label={`Less for ${c.name}`} disabled={busy || c.allocated <= 0} onClick={() => step(c, -1)} />
                      <StepButton icon="add" label={`More for ${c.name}`} disabled={busy || (free?.allocated ?? 0) <= 0} onClick={() => step(c, 1)} />
                    </div>
                  )}
                  <div className="tabular min-w-[84px] text-right font-label-bold text-[15px] text-on-surface">{money(c.allocated, c.currency)}</div>
                </div>
                {c.type === 'savings' && (
                  <div className="flex flex-wrap gap-2 pl-[52px]">
                    {SAVINGS_RATES.map((rate) => (
                      <Chip key={rate} selected={rate === plan.savingsRate} onClick={() => void rebuild({ savingsRate: rate })}>
                        {Math.round(rate * 100)}%
                      </Chip>
                    ))}
                  </div>
                )}
              </div>
            ))}
        </PlanGroup>
      ))}

      <div className="sticky bottom-0 -mx-margin mt-1 bg-gradient-to-t from-surface via-surface to-surface/0 px-margin pb-4 pt-6">
        <PrimaryButton disabled={busy} onClick={() => void actions.approve()} icon="check">
          Approve plan
        </PrimaryButton>
        <p className="mt-2 text-center font-body-sm text-body-sm text-on-surface-variant">Nothing moves until you approve.</p>
      </div>
    </div>
  );
}

function StepButton({ icon, label, disabled, onClick }: { icon: string; label: string; disabled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-container-high transition hover:bg-surface-variant active:scale-95 disabled:opacity-40"
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}

function AllocationBar({ plan }: { plan: Plan }) {
  const items = plan.categories.filter((c) => c.allocated > 0);
  const share = (c: Category) => (plan.salary > 0 ? (c.allocated / plan.salary) * 100 : 0);
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface-variant">Salary</span>
        <span className="tabular font-balance-numeral text-[28px] leading-8 text-on-surface">{money(plan.salary, plan.currency)}</span>
      </div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-high">
        {items.map((c) => (
          <div key={c.id} title={`${c.name} ${money(c.allocated, c.currency)}`} className="h-full" style={{ width: `${share(c)}%`, background: jarStyle(c.id).bar }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {items.map((c) => (
          <span key={c.id} className="inline-flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
            <span className="h-2 w-2 rounded-full" style={{ background: jarStyle(c.id).bar }} />
            {c.name} {Math.round(share(c))}%
          </span>
        ))}
      </div>
    </Card>
  );
}

function FxCard({ quotes, categories, busy, onRefresh }: { quotes: FxQuote[]; categories: Category[]; busy: boolean; onRefresh(): void }) {
  if (quotes.length === 0) return null;
  const [first] = quotes;
  const names = new Map(categories.map((c) => [c.id, c.name]));
  const fees = round2(quotes.reduce((sum, q) => sum + q.fee, 0));
  const label = !first.live ? 'Offline rate' : first.provider === 'wise-sandbox' ? 'Wise sandbox quote' : 'Live Wise quote';
  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Tag tone={first.live ? 'lime' : 'warn'} icon={first.live ? 'bolt' : 'cloud_off'}>
          {label}
        </Tag>
        <TextButton onClick={onRefresh} disabled={busy}>
          <Icon name="refresh" className="text-[16px]" />
          Refresh
        </TextButton>
      </div>
      <div className="tabular font-headline-md text-headline-md text-on-surface">
        1 {first.source} = {first.rate.toFixed(5)} {first.target}
      </div>
      <div className="flex flex-col divide-y divide-surface-container">
        {quotes.map((quote) => (
          <div key={quote.id} className="flex items-center justify-between py-2">
            <span className="font-body-md text-body-md text-on-surface">
              {names.get(quote.categoryId ?? '') ?? 'Bill'} {money(quote.targetAmount, quote.target)}
            </span>
            <span className="tabular font-label-bold text-label-bold text-on-surface">= {money(quote.sourceAmount, quote.source)}</span>
          </div>
        ))}
      </div>
      <p className="font-body-sm text-body-sm text-outline">
        {first.live
          ? `Quoted by Wise at ${clockTime(first.fetchedAt)}. Wise fees included (${money(fees, first.source)}).`
          : first.note}
      </p>
    </Card>
  );
}

function PlanGroup({ type, children }: { type: CategoryType; children: ReactNode }) {
  const { emoji, label, caption } = TYPE_LABELS[type];
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="shrink-0 font-title-sm text-title-sm text-on-surface">
          {emoji} {label}
        </h2>
        <span className="text-right font-body-sm text-body-sm text-outline">{caption}</span>
      </div>
      <div className="flex flex-col divide-y divide-surface-container overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm">{children}</div>
    </section>
  );
}

function ActivePlan({ plan, state }: { plan: Plan; state: AppState }) {
  const { navigate } = useLoadedStore();
  return (
    <div className="flex flex-col gap-space-lg px-margin pb-8 pt-space-md">
      <ScreenTitle
        tag={
          <Tag tone="success" icon="check_circle">
            Active
          </Tag>
        }
        title={`${monthName(plan.month)} plan`}
        subtitle={`Approved ${shortDate(plan.approvedAt ?? plan.createdAt)} · ${money(plan.salary, plan.currency)} salary from ${state.employer}`}
      />
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Spent" value={money(state.totals.spent, plan.currency)} />
        <Stat label="Left to spend" value={money(state.totals.leftToSpend, plan.currency)} highlight />
        <Stat label="Bills reserved" value={money(state.totals.reservedBills, plan.currency)} />
      </div>
      {state.totals.uncovered > 0 && (
        <Banner tone="danger" icon="warning" title={`${money(state.totals.uncovered, plan.currency)} over budget`}>
          All flexible jars are empty. Rent, utilities and the cushion stay protected.
        </Banner>
      )}
      {TYPES.map((type) => (
        <PlanGroup key={type} type={type}>
          {plan.categories
            .filter((c) => c.type === type)
            .map((c) => (
              <JarProgressRow key={c.id} category={c} state={state} />
            ))}
        </PlanGroup>
      ))}
      <PrimaryButton icon="shopping_bag" onClick={() => navigate('spend')}>
        Simulate a purchase
      </PrimaryButton>
    </div>
  );
}

function JarProgressRow({ category: c, state }: { category: Category; state: AppState }) {
  const budget = round2(c.allocated + c.coveredIn - c.coveredOut);
  const progress = budget > 0 ? c.spent / budget : c.spent > 0 ? 1 : 0;
  const notes: Array<{ icon: string; text: string; className: string }> = [];
  if (c.coveredIn > 0) {
    notes.push({ icon: 'shield', text: `${money(c.coveredIn, c.currency)} overspend covered by ${coverageDonors(state, c.id)}`, className: 'text-primary' });
  }
  if (c.coveredOut > 0) {
    notes.push({ icon: 'volunteer_activism', text: `Gave ${money(c.coveredOut, c.currency)} to cover overspends`, className: 'text-on-surface-variant' });
  }
  if (c.remaining < 0) {
    notes.push({ icon: 'warning', text: `${money(-c.remaining, c.currency)} could not be covered`, className: 'text-error' });
  }
  const subtitle = c.bill
    ? `${money(c.bill.amount, c.bill.currency)} locked at the Wise rate`
    : c.type === 'savings'
      ? `Saved first · cushion total ${money(state.cushionBalance + c.allocated, c.currency)}`
      : c.usually
        ? `Usually ${money(c.usually, c.currency, 0)} a month`
        : 'Spend it guilt-free';

  return (
    <div className="flex flex-col gap-2 p-4">
      <div className="flex items-center gap-3">
        <JarIcon category={c} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 font-label-bold text-label-bold text-on-surface">
            {c.name}
            {c.locked && <Icon name="lock" className="text-[14px] text-outline" />}
          </div>
          <div className="truncate font-body-sm text-body-sm text-on-surface-variant">{subtitle}</div>
        </div>
        <div className="text-right">
          <div className={`tabular font-label-bold text-[15px] ${c.remaining < 0 ? 'text-error' : 'text-on-surface'}`}>{money(c.remaining, c.currency)}</div>
          <div className="font-body-sm text-body-sm text-outline">of {money(budget, c.currency)}</div>
        </div>
      </div>
      {c.type !== 'savings' && <ProgressBar value={progress} color={jarStyle(c.id).bar} over={c.remaining < 0} />}
      {notes.map((note) => (
        <div key={note.text} className={`flex items-center gap-1.5 font-body-sm text-body-sm ${note.className}`}>
          <Icon name={note.icon} className="text-[16px]" />
          {note.text}
        </div>
      ))}
    </div>
  );
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
