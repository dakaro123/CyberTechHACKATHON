import type { MonthEndResult } from '../../../shared/types';
import { Banner, Card, Icon, JarIcon, PrimaryButton, ScreenTitle, Stat, Tag } from '../components/ui';
import { money, monthName, nextMonth } from '../format';
import { useLoadedStore } from '../store';

export function MonthEndScreen() {
  const { state, actions, busy, navigate } = useLoadedStore();
  const result = state.monthEnd;

  if (state.phase === 'closed' && result) {
    return (
      <div className="flex flex-col items-center gap-space-lg px-margin pb-8 pt-space-xl text-center">
        <div className="flex h-24 w-24 animate-pop-in items-center justify-center rounded-full bg-primary-container">
          <Icon name="savings" filled className="text-[48px] text-on-primary-fixed" />
        </div>
        <div className="flex flex-col gap-2">
          <span className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface-variant">{monthName(result.month)} closed</span>
          <h1 className="font-display-hero-mobile text-display-hero-mobile text-on-surface">You saved {money(result.saved, state.currency)}</h1>
          <p className="font-body-md text-body-md text-on-surface-variant">Moved from your flexible jars into the safety cushion.</p>
        </div>
        <Sweeps result={result} currency={state.currency} />
        <CushionCard result={result} currency={state.currency} />
        <div className="grid w-full grid-cols-2 gap-2">
          <Stat label="Spent this month" value={money(result.spent, state.currency)} />
          <Stat label="Cushion total" value={money(result.cushionAfter, state.currency)} highlight />
        </div>
        <PrimaryButton icon="payments" onClick={() => navigate('plan')}>
          Start {monthName(nextMonth(result.month))} payday
        </PrimaryButton>
      </div>
    );
  }

  if (state.phase !== 'active' || !result) {
    return (
      <div className="flex flex-col items-center gap-4 px-margin pb-8 pt-space-2xl text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-container-high">
          <Icon name="event_available" className="text-[32px] text-on-surface-variant" />
        </span>
        <div>
          <h1 className="font-headline-md text-headline-md">Nothing to close yet</h1>
          <p className="mt-1 font-body-md text-body-md text-on-surface-variant">Approve a payday plan first. At month end, leftovers go to your cushion.</p>
        </div>
        <PrimaryButton size="md" icon="payments" className="max-w-[240px]" onClick={() => navigate('plan')}>
          Go to payday
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-space-lg px-margin pb-8 pt-space-md">
      <ScreenTitle
        tag={
          <Tag tone="neutral" icon="event_available">
            Month end
          </Tag>
        }
        title={`Close ${monthName(state.month)}`}
        subtitle="Leftovers from flexible jars go to your safety cushion. Fixed bills stay reserved for their standing orders."
      />
      <div className="flex flex-col items-center gap-1 rounded-lg bg-primary-container p-6 text-center text-on-primary-fixed">
        <span className="font-currency-tag text-currency-tag uppercase tracking-wider">You'll save</span>
        <span className="tabular font-display-hero-mobile text-display-hero-mobile">{money(result.saved, state.currency)}</span>
        <span className="font-body-sm text-body-sm">into 🛡 Safety cushion</span>
      </div>
      <Sweeps result={result} currency={state.currency} />
      <CushionCard result={result} currency={state.currency} />
      {result.uncovered > 0 && (
        <Banner tone="danger" icon="warning" title={`${money(result.uncovered, state.currency)} overspend was not covered`}>
          Flexible jars ran out. Rent, utilities and the cushion were still protected.
        </Banner>
      )}
      <PrimaryButton disabled={busy} icon="savings" onClick={() => void actions.monthEnd()}>
        Close month and save {money(result.saved, state.currency)}
      </PrimaryButton>
    </div>
  );
}

function Sweeps({ result, currency }: { result: MonthEndResult; currency: string }) {
  const { state } = useLoadedStore();
  const jars = new Map(state.plan?.categories.map((c) => [c.id, c]));
  return (
    <Card className="flex w-full flex-col gap-3 text-left">
      <span className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface-variant">Leftovers to the cushion</span>
      {result.sweeps.length === 0 && <span className="font-body-md text-body-md text-on-surface-variant">Nothing left in flexible jars this month.</span>}
      {result.sweeps.map((sweep) => {
        const jar = jars.get(sweep.categoryId);
        return (
          <div key={sweep.categoryId} className="flex items-center gap-3">
            {jar && <JarIcon category={jar} size="sm" />}
            <span className="flex-1 font-label-bold text-label-bold text-on-surface">{sweep.name}</span>
            <span className="tabular font-label-bold text-label-bold text-primary">+{money(sweep.amount, currency)}</span>
          </div>
        );
      })}
    </Card>
  );
}

function CushionCard({ result, currency }: { result: MonthEndResult; currency: string }) {
  const total = Math.max(result.cushionAfter, 1);
  const parts = [
    { value: result.cushionBefore, color: '#acd28c' },
    { value: result.plannedSavings, color: '#2f6c00' },
    { value: result.saved, color: '#9fe870' },
  ];
  return (
    <Card className="flex w-full flex-col gap-3 text-left">
      <div className="flex items-center gap-3">
        <JarIcon category={{ id: 'cushion', icon: 'savings' }} />
        <div className="min-w-0 flex-1">
          <div className="font-label-bold text-label-bold text-on-surface">Safety cushion</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">
            {money(result.cushionBefore, currency)} + {money(result.plannedSavings, currency)} planned + {money(result.saved, currency)} leftovers
          </div>
        </div>
        <span className="tabular font-label-bold text-[15px] text-on-surface">{money(result.cushionAfter, currency)}</span>
      </div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-container-high">
        {parts.map((part, index) => (
          <div key={index} className="h-full" style={{ width: `${(part.value / total) * 100}%`, background: part.color }} />
        ))}
      </div>
    </Card>
  );
}
