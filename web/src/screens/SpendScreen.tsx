import { useState } from 'react';
import type { AppState, MerchantInfo } from '../../../shared/types';
import { PurchaseRow } from '../components/PurchaseRow';
import { Banner, Card, Chip, Flag, Icon, PrimaryButton, ScreenTitle, SectionTitle, Spinner, Tag, TextButton } from '../components/ui';
import { money } from '../format';
import { useLoadedStore } from '../store';

const QUICK_MERCHANTS = ['Maxima', 'Rimi', 'Lidl', 'Wolt', 'Circle K', 'Bolt', 'Netflix', 'Lido', 'H&M'];
const CURRENCIES = ['EUR', 'GBP'];

export function SpendScreen() {
  const { state, merchants, actions, busy, navigate, openPurchase } = useLoadedStore();
  const [merchant, setMerchant] = useState('Maxima');
  const [amount, setAmount] = useState('42.30');
  const [currency, setCurrency] = useState('EUR');

  const active = state.phase === 'active';
  const value = Number(amount.replace(',', '.'));
  const valid = merchant.trim().length > 0 && Number.isFinite(value) && value > 0 && value <= 100_000;
  const quick = QUICK_MERCHANTS.map((name) => merchants.find((m) => m.name === name)).filter((m): m is MerchantInfo => Boolean(m));
  const categories = state.plan?.categories ?? [];
  const purchases = [...state.purchases].reverse();
  const rate = state.plan?.fxQuotes[0]?.rate ?? state.fx?.rate;
  const overspendAmount = overspendScenario(state);

  const pay = async (name: string, paid: number, paidCurrency: string) => {
    const result = await actions.purchase({ merchant: name, amount: paid, currency: paidCurrency });
    if (result) openPurchase(result.purchase.id);
  };

  return (
    <div className="flex flex-col gap-space-lg px-margin pb-8 pt-space-md">
      <ScreenTitle
        tag={
          <Tag tone="neutral" icon="credit_card">
            Wise card
          </Tag>
        }
        title="Spend"
        subtitle="Simulate a card payment. Wise Flow suggests a jar, and you can move it in one tap."
      />

      {!active && (
        <Banner tone="warn" icon="info" title={state.phase === 'closed' ? 'This month is closed' : 'No active plan yet'}>
          {state.phase === 'closed' ? 'Start the next payday to spend from fresh jars. ' : 'Approve your payday plan first. '}
          <TextButton onClick={() => navigate('plan')}>Go to plan</TextButton>
        </Banner>
      )}

      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface-variant">Merchant</span>
          <div className="no-scrollbar -mx-5 flex gap-2 overflow-x-auto px-5">
            {quick.map((m) => (
              <Chip
                key={m.name}
                icon={m.icon}
                selected={merchant === m.name}
                onClick={() => {
                  setMerchant(m.name);
                  setAmount(m.typicalAmount.toFixed(2));
                  setCurrency('EUR');
                }}
              >
                {m.name}
              </Chip>
            ))}
          </div>
          <input
            value={merchant}
            maxLength={60}
            onChange={(event) => setMerchant(event.target.value)}
            placeholder="Or type any merchant"
            aria-label="Merchant"
            className="h-12 rounded bg-surface-container-low px-4 font-body-md text-body-md text-on-surface outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="font-currency-tag text-currency-tag uppercase tracking-wider text-on-surface-variant">Amount</span>
          <div className="flex items-center gap-3">
            <div className="flex shrink-0 rounded-full bg-surface-container p-1">
              {CURRENCIES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setCurrency(code)}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 font-label-bold text-label-bold transition ${currency === code ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant'}`}
                >
                  <Flag currency={code} className="h-4 w-4" />
                  {code}
                </button>
              ))}
            </div>
            <input
              inputMode="decimal"
              value={amount}
              aria-label="Amount"
              onChange={(event) => setAmount(event.target.value)}
              className="tabular min-w-0 flex-1 bg-transparent text-right font-balance-numeral text-[28px] leading-8 text-on-surface outline-none"
            />
          </div>
          {currency !== state.currency && rate && valid && (
            <span className="text-right font-body-sm text-body-sm text-outline">
              ≈ {money(value / rate, state.currency)} at the Wise rate {rate.toFixed(4)}
            </span>
          )}
        </div>

        <PrimaryButton disabled={!active || !valid || busy} onClick={() => void pay(merchant.trim(), value, currency)} icon={busy ? undefined : 'contactless'}>
          {busy ? <Spinner /> : `Pay ${money(valid ? value : 0, currency)}`}
        </PrimaryButton>
      </Card>

      {active && (
        <section className="flex flex-col gap-2">
          <SectionTitle title="Demo scenarios" />
          <div className="flex flex-col divide-y divide-surface-container overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm">
            <ScenarioRow
              icon="shopping_cart"
              title="Weekly shop at Maxima"
              text="€42.30, suggested Food. Then move part of it to Free Money."
              disabled={busy}
              onClick={() => void pay('Maxima', 42.3, 'EUR')}
            />
            {overspendAmount && (
              <ScenarioRow
                icon="local_fire_department"
                title="Party shop that blows the Food jar"
                text={`${money(overspendAmount, 'EUR', 0)} at Maxima. Free Money covers the overspend.`}
                disabled={busy}
                onClick={() => void pay('Maxima', overspendAmount, 'EUR')}
              />
            )}
            <ScenarioRow
              icon="local_gas_station"
              title="Fuel at Circle K"
              text="€54.20, suggested Car."
              disabled={busy}
              onClick={() => void pay('Circle K', 54.2, 'EUR')}
            />
          </div>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <SectionTitle
          title="This month"
          action={<span className="font-body-sm text-body-sm text-outline">{purchases.length} payments</span>}
        />
        <div className="flex flex-col overflow-hidden rounded-lg bg-surface-container-lowest shadow-sm">
          {purchases.map((p) => (
            <PurchaseRow key={p.id} purchase={p} categories={categories} onClick={() => openPurchase(p.id)} />
          ))}
          {purchases.length === 0 && (
            <div className="p-6 text-center font-body-sm text-body-sm text-on-surface-variant">No card payments yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function ScenarioRow({ icon, title, text, disabled, onClick }: { icon: string; title: string; text: string; disabled?: boolean; onClick(): void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-container-low disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-fixed">
        <Icon name={icon} className="text-[20px]" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="font-label-bold text-label-bold text-on-surface">{title}</span>
        <span className="font-body-sm text-body-sm text-on-surface-variant">{text}</span>
      </span>
      <Icon name="play_arrow" className="text-[22px] text-on-surface-variant" />
    </button>
  );
}

/** A Maxima ticket (EUR) big enough to overspend whatever is left in the Food jar. */
function overspendScenario(state: AppState): number | null {
  const food = state.plan?.categories.find((c) => c.id === 'food');
  const rate = state.plan?.fxQuotes[0]?.rate ?? state.fx?.rate;
  if (!food || !rate || state.phase !== 'active') return null;
  return Math.ceil((Math.max(food.remaining, 0) * rate + 60) / 10) * 10;
}
