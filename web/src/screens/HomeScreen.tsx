import { useState, type ReactNode } from 'react';
import type { AppState, Category } from '../../../shared/types';
import { PurchaseRow, SalaryRow } from '../components/PurchaseRow';
import { Chip, Icon, JarIcon, ProgressBar, RoundAction, SectionTitle, Tag, TextButton, TypeTag } from '../components/ui';
import { money, monthName, nextMonth } from '../format';
import { coverageDonors } from '../selectors';
import { useLoadedStore, type Route } from '../store';
import { jarStyle } from '../theme';

export function HomeScreen() {
  const { state } = useLoadedStore();
  return (
    <div className="flex flex-col gap-space-xl px-margin pb-6 pt-space-md">
      <BalanceHero state={state} />
      <QuickActions state={state} />
      <Jars state={state} />
      <SmartCard state={state} />
      <Transactions state={state} />
    </div>
  );
}

function BalanceHero({ state }: { state: AppState }) {
  const { phase, plan, totals, currency, monthEnd, month } = state;
  let label = `Left to spend · ${currency}`;
  let value = totals.leftToSpend;
  let sub: ReactNode = (
    <>
      <Icon name="lock" className="text-[16px] text-primary" />
      {money(totals.reservedBills)} reserved for bills · {money(totals.cushionThisMonth)} saved
    </>
  );
  if (phase === 'awaiting-payday') {
    label = `${monthName(month)} · ${currency}`;
    value = 0;
    sub = (
      <>
        <Icon name="schedule" className="text-[16px]" />
        Waiting for payday
      </>
    );
  } else if (phase === 'draft' && plan) {
    label = `${monthName(plan.month)} salary · ${currency}`;
    value = plan.salary;
    sub = (
      <>
        <Icon name="pending_actions" className="text-[16px] text-primary" />
        Plan ready, waiting for your approval
      </>
    );
  } else if (phase === 'closed' && monthEnd) {
    label = `Saved in ${monthName(month)}`;
    value = monthEnd.saved;
    sub = (
      <>
        <Icon name="trending_up" className="text-[16px] text-primary" />
        Cushion now {money(monthEnd.cushionAfter)}
      </>
    );
  }

  return (
    <section className="flex flex-col items-center justify-center text-center">
      <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-3 py-1">
        <span className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface">{label}</span>
      </span>
      <span className="tabular font-balance-numeral text-balance-numeral tracking-tight text-on-surface">{money(value, currency)}</span>
      <div className="mt-1 flex items-center gap-1 font-body-sm text-body-sm text-on-surface-variant">{sub}</div>
    </section>
  );
}

function QuickActions({ state }: { state: AppState }) {
  const { navigate } = useLoadedStore();
  const actions: Array<{ icon: string; label: string; route: Route; primary: boolean }> = [
    { icon: 'payments', label: 'Payday', route: 'plan', primary: state.phase !== 'active' },
    { icon: 'shopping_bag', label: 'Spend', route: 'spend', primary: state.phase === 'active' },
    { icon: 'insights', label: 'Forecast', route: 'insights', primary: false },
    { icon: 'event_available', label: 'Month end', route: 'month-end', primary: false },
  ];
  return (
    <section className="mx-auto flex w-full max-w-sm items-center justify-around">
      {actions.map((action) => (
        <RoundAction key={action.label} icon={action.icon} label={action.label} primary={action.primary} onClick={() => navigate(action.route)} />
      ))}
    </section>
  );
}

function Jars({ state }: { state: AppState }) {
  const { navigate } = useLoadedStore();
  const showJars = state.plan && (state.phase === 'draft' || state.phase === 'active');
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle title="Jars" action={<TextButton onClick={() => navigate('plan')}>Manage</TextButton>} />
      <div className="no-scrollbar -mx-margin flex snap-x snap-mandatory scroll-px-margin gap-3 overflow-x-auto px-margin pb-2">
        {showJars ? (
          state.plan!.categories.map((category) => (
            <JarCard key={category.id} category={category} state={state} onClick={() => navigate('plan')} />
          ))
        ) : (
          <button
            type="button"
            onClick={() => navigate('plan')}
            className="w-full shrink-0 snap-start rounded-lg bg-surface-container-low p-5 text-left transition-colors hover:bg-surface-container"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-container-highest">
                <Icon name="add" className="text-[22px]" />
              </span>
              <div className="flex flex-col">
                <span className="font-label-bold text-label-bold text-on-surface">
                  {state.phase === 'closed' ? `${monthName(nextMonth(state.month))} jars appear after payday` : 'No jars yet'}
                </span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  Payday creates 🔒 Rent and Utilities, 🛡 Cushion, 🔄 Food, Car and Free Money.
                </span>
              </div>
            </div>
          </button>
        )}
      </div>
    </section>
  );
}

function JarCard({ category: c, state, onClick }: { category: Category; state: AppState; onClick(): void }) {
  const style = jarStyle(c.id);
  const draft = state.phase === 'draft';
  const budget = c.allocated + c.coveredIn - c.coveredOut;
  const progress = budget > 0 ? c.spent / budget : c.spent > 0 ? 1 : 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-60 shrink-0 snap-start flex-col justify-between rounded-lg bg-surface-container-lowest p-4 text-left shadow-sm transition hover:shadow-md"
    >
      <div className="flex w-full items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <JarIcon category={c} size="sm" />
          <span className="truncate font-label-bold text-label-bold text-on-surface">{c.name}</span>
        </div>
        <TypeTag type={c.type} />
      </div>
      <div className="mt-4">
        <div
          className={`tabular font-balance-numeral text-[28px] leading-[32px] tracking-tight ${c.remaining < 0 ? 'text-error' : 'text-on-surface'}`}
        >
          {money(draft ? c.allocated : c.remaining, c.currency)}
        </div>
        <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">{draft ? 'planned' : `left of ${money(budget, c.currency)}`}</p>
      </div>
      <div className="mt-3 w-full">
        <ProgressBar value={draft ? 0 : progress} color={style.bar} over={c.remaining < 0} />
      </div>
      <div className="mt-3 flex w-full items-center justify-between gap-2">
        <span className="truncate font-body-sm text-body-sm text-outline">{jarFootnote(c, state)}</span>
        <Icon name="chevron_right" className="text-[18px] text-on-surface-variant" />
      </div>
    </button>
  );
}

function jarFootnote(c: Category, state: AppState): string {
  if (c.bill) return `${money(c.bill.amount, c.bill.currency)} at the Wise rate`;
  if (c.type === 'savings') return `Cushion total ${money(state.cushionBalance + c.allocated, c.currency)}`;
  if (c.coveredIn > 0) return `+${money(c.coveredIn, c.currency)} from ${coverageDonors(state, c.id)}`;
  if (c.coveredOut > 0) return `Covered ${money(c.coveredOut, c.currency)} of overspends`;
  if (c.usually) return `Usually ${money(c.usually, c.currency, 0)} a month`;
  if (c.id === 'free') return 'Spend it guilt-free';
  return '';
}

function SmartCard({ state }: { state: AppState }) {
  const { navigate, openPurchase, forecast } = useLoadedStore();
  const { phase, plan, monthEnd, currency } = state;

  let tag: { tone: 'lime' | 'warn' | 'success' | 'neutral'; icon: string; label: string } = { tone: 'lime', icon: 'bolt', label: 'Payday' };
  let title = `${money(state.defaultSalary, currency, 0)} salary just landed`;
  let text = 'Rent first, cushion next, the rest into flexible jars, at the live Wise rate.';
  let cta = 'Plan my payday';
  let icon = 'payments';
  let onCta = () => navigate('plan');

  if (phase === 'draft' && plan) {
    tag = { tone: 'warn', icon: 'pending', label: 'Needs approval' };
    title = `Your ${monthName(plan.month)} plan is ready`;
    text = 'Check the jars and the Wise quote for rent. Nothing moves until you approve.';
    cta = 'Review plan';
    icon = 'fact_check';
  } else if (phase === 'active') {
    const covered = [...state.purchases].reverse().find((p) => p.coverage.length > 0);
    if (covered) {
      const names = new Map(plan?.categories.map((c) => [c.id, c.name]));
      const jar = names.get(covered.coverage[0].toCategoryId) ?? 'A jar';
      tag = { tone: 'success', icon: 'shield', label: 'Protected' };
      title = `${jar} overspend covered by ${coverageDonors(state, covered.coverage[0].toCategoryId)}`;
      text = 'Rent, utilities and your cushion are never used to cover overspends.';
      cta = 'See purchase';
      icon = 'shield';
      onCta = () => openPurchase(covered.id);
    } else {
      const food = plan?.categories.find((c) => c.id === 'food');
      const usual = forecast?.categories.find((c) => c.categoryId === 'food')?.usually;
      tag = { tone: 'neutral', icon: 'insights', label: 'Forecast' };
      title = food ? `Food: ${money(food.spent, currency)} spent of ${money(food.allocated, currency)}` : 'Your jars are live';
      text = usual ? `You usually spend ${money(usual, currency, 0)} a month on food.` : 'Try a card payment to see the jars react.';
      cta = 'Open forecast';
      icon = 'insights';
      onCta = () => navigate('insights');
    }
  } else if (phase === 'closed' && monthEnd) {
    tag = { tone: 'lime', icon: 'savings', label: 'Month closed' };
    title = `You saved ${money(monthEnd.saved, currency)}`;
    text = `Leftovers moved into your safety cushion. It now holds ${money(monthEnd.cushionAfter, currency)}.`;
    cta = `Start ${monthName(nextMonth(state.month))} payday`;
    icon = 'savings';
  }

  return (
    <section className="w-full">
      <div className="relative overflow-hidden rounded-lg bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex max-w-[70%] flex-col gap-1.5">
            <Tag tone={tag.tone} icon={tag.icon}>
              {tag.label}
            </Tag>
            <h2 className="mt-1 font-title-sm text-title-sm text-on-surface">{title}</h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant">{text}</p>
          </div>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center self-center rounded-full bg-secondary-container">
            <Icon name={icon} className="text-[32px] text-on-secondary-fixed" />
          </div>
        </div>
        <div className="mt-4 flex items-center justify-between pt-2">
          <TextButton onClick={onCta}>
            {cta}
            <Icon name="arrow_forward" className="text-[16px]" />
          </TextButton>
          <span className="font-currency-tag text-currency-tag text-outline">
            {state.fx?.live ? 'Live Wise rate' : 'Synthetic demo data'}
          </span>
        </div>
      </div>
    </section>
  );
}

function Transactions({ state }: { state: AppState }) {
  const { navigate, openPurchase } = useLoadedStore();
  const [filter, setFilter] = useState('all');
  const categories = state.plan?.categories ?? [];
  const filters = [{ id: 'all', label: 'All' }, ...categories.filter((c) => c.type === 'flexible').map((c) => ({ id: c.id, label: c.name }))];
  const purchases = [...state.purchases]
    .reverse()
    .filter((p) => filter === 'all' || p.splits.some((s) => s.categoryId === filter))
    .slice(0, 5);
  const plan = state.plan;
  const showSalary = filter === 'all' && plan && (state.phase === 'active' || state.phase === 'closed');

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle title="Transactions" action={<TextButton onClick={() => navigate('spend')}>See all</TextButton>} />
      {categories.length > 0 && (
        <div className="no-scrollbar flex items-center gap-2 overflow-x-auto">
          {filters.map((f) => (
            <Chip key={f.id} selected={filter === f.id} onClick={() => setFilter(f.id)}>
              {f.label}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm">
        {purchases.map((p) => (
          <PurchaseRow key={p.id} purchase={p} categories={categories} onClick={() => openPurchase(p.id)} />
        ))}
        {showSalary && (
          <SalaryRow amount={plan.salary} currency={plan.currency} employer={state.employer} date={plan.approvedAt ?? plan.createdAt} />
        )}
        {purchases.length === 0 && !showSalary && (
          <div className="p-6 text-center font-body-sm text-body-sm text-on-surface-variant">
            {filter === 'all' ? 'No transactions yet. Approve a payday plan, then try a purchase.' : 'Nothing in this jar yet.'}
          </div>
        )}
      </div>
    </section>
  );
}
