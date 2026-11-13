import type { Category, CategoryForecast } from '../../../shared/types';
import { Banner, Card, JarIcon, ScreenTitle, Spinner, Tag } from '../components/ui';
import { money, monthName } from '../format';
import { useLoadedStore } from '../store';
import { jarStyle } from '../theme';

export function InsightsScreen() {
  const { state, forecast } = useLoadedStore();
  if (!forecast) {
    return (
      <div className="flex justify-center p-10 text-primary">
        <Spinner />
      </div>
    );
  }
  const plan = state.plan?.month === forecast.month ? state.plan : null;
  const live = state.phase === 'active' && plan !== null;
  const months = forecast.historyMonths.map((m) => monthName(m, 'short')).join(', ');

  return (
    <div className="flex flex-col gap-space-lg px-margin pb-8 pt-space-md">
      <ScreenTitle
        tag={
          <Tag tone="neutral" icon="insights">
            Forecast
          </Tag>
        }
        title={`${monthName(forecast.month)} forecast`}
        subtitle={`From your last 3 months (${months}): moving average + 5% buffer.`}
      />
      {forecast.categories.map((item) => (
        <ForecastCard
          key={item.categoryId}
          item={item}
          jar={plan?.categories.find((c) => c.id === item.categoryId)}
          currency={forecast.currency}
          live={live}
        />
      ))}
      <Banner tone="info" icon="verified_user" title="You stay in control">
        Forecasts only suggest amounts. Money never moves without your approval.
      </Banner>
      <p className="text-center font-body-sm text-body-sm text-outline">History is synthetic demo data (Maxima, Rimi, Bolt, Netflix…).</p>
    </div>
  );
}

function ForecastCard({ item, jar, currency, live }: { item: CategoryForecast; jar?: Category; currency: string; live: boolean }) {
  const style = jarStyle(item.categoryId);
  const isFree = item.categoryId === 'free';
  const planned = jar?.allocated;
  const bars = [
    ...item.history.map((h) => ({ label: monthName(h.month, 'short'), value: h.spent, color: '#d9dad7', strong: false })),
    { label: isFree ? 'Usual' : 'Plan', value: isFree ? item.usually : item.forecast, color: style.bar, strong: true },
    ...(live ? [{ label: 'Now', value: item.spentThisMonth, color: '#2e312f', strong: true }] : []),
  ];
  const max = Math.max(...bars.map((b) => b.value), 1);

  let text = isFree
    ? `Free Money gets whatever is left after the other jars. You usually spend ${money(item.usually, currency, 0)} on fun.`
    : `Plan ${money(item.forecast, currency, 0)} = average ${money(item.usually, currency, 0)} + 5% buffer, rounded.`;
  if (live && planned !== undefined && !isFree) {
    const share = planned > 0 ? Math.round((item.spentThisMonth / planned) * 100) : 0;
    text = `${money(item.spentThisMonth, currency)} spent so far: ${share}% of the ${money(planned, currency, 0)} jar.`;
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <JarIcon category={{ id: item.categoryId, icon: item.icon }} />
        <div className="min-w-0 flex-1">
          <div className="font-label-bold text-label-bold text-on-surface">{item.name}</div>
          <div className="font-body-sm text-body-sm text-on-surface-variant">Usually {money(item.usually, currency, 0)} a month</div>
        </div>
        {!isFree && <Tag tone="lime">Plan {money(item.forecast, currency, 0)}</Tag>}
      </div>
      <div className="flex h-36 items-stretch gap-3">
        {bars.map((bar) => (
          <div key={bar.label} className="flex flex-1 flex-col items-center gap-1">
            <span className="tabular font-currency-tag text-currency-tag text-on-surface-variant">{money(bar.value, currency, 0)}</span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-[10px] transition-[height] duration-500"
                style={{ height: `${Math.max(3, (bar.value / max) * 100)}%`, background: bar.color }}
              />
            </div>
            <span className={`font-body-sm text-body-sm ${bar.strong ? 'font-semibold text-on-surface' : 'text-outline'}`}>{bar.label}</span>
          </div>
        ))}
      </div>
      <p className="font-body-sm text-body-sm text-on-surface-variant">{text}</p>
    </Card>
  );
}
