import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppState } from '../../shared/types';
import { PurchaseSheet } from './components/PurchaseSheet';
import { Icon, PrimaryButton, Spinner } from './components/ui';
import { money } from './format';
import { HomeScreen } from './screens/HomeScreen';
import { InsightsScreen } from './screens/InsightsScreen';
import { MonthEndScreen } from './screens/MonthEndScreen';
import { PlanScreen } from './screens/PlanScreen';
import { SpendScreen } from './screens/SpendScreen';
import { StoreProvider, useStore, type Route } from './store';

const NAV: Array<{ route: Route; icon: string; label: string }> = [
  { route: 'home', icon: 'home', label: 'Home' },
  { route: 'plan', icon: 'account_balance_wallet', label: 'Plan' },
  { route: 'spend', icon: 'credit_card', label: 'Spend' },
  { route: 'insights', icon: 'insights', label: 'Forecast' },
  { route: 'month-end', icon: 'event_available', label: 'Month end' },
];

const SCREENS: Record<Route, () => ReactNode> = {
  home: () => <HomeScreen />,
  plan: () => <PlanScreen />,
  spend: () => <SpendScreen />,
  insights: () => <InsightsScreen />,
  'month-end': () => <MonthEndScreen />,
};

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}

function Shell() {
  const { state, route, connectionError, reload } = useStore();
  const mainRef = useRef<HTMLElement>(null);
  const phase = state?.phase;

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [route, phase]);

  let content: ReactNode;
  if (state) content = SCREENS[route]();
  else if (connectionError) content = <ConnectionError message={connectionError} onRetry={reload} />;
  else content = <Loading />;

  return (
    <div className="flex min-h-[100dvh] items-stretch justify-center gap-12 bg-surface-dim md:items-center md:p-8">
      <DemoGuide />
      <div className="relative flex h-[100dvh] w-full max-w-[440px] flex-col overflow-hidden bg-surface md:h-[min(900px,calc(100dvh-4rem))] md:rounded-[2.75rem] md:shadow-2xl md:ring-[10px] md:ring-inverse-surface">
        <Header />
        {state && connectionError && (
          <div className="flex items-center gap-2 bg-error-container px-margin py-2 font-body-sm text-body-sm text-on-error-container">
            <Icon name="cloud_off" className="text-[16px]" />
            {connectionError}
          </div>
        )}
        <main ref={mainRef} className="no-scrollbar flex-1 overflow-y-auto">
          {content}
        </main>
        <BottomNav />
        <PurchaseSheet />
        <ToastView />
      </div>
    </div>
  );
}

function Header() {
  const { state, navigate, actions, busy } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fx = state?.fx;

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [menuOpen]);

  return (
    <header className="z-30 shrink-0 bg-surface/85 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-between px-margin">
        <button type="button" onClick={() => navigate('home')} className="flex items-center gap-2" aria-label="Wise Flow home">
          <Logo />
        </button>
        <div className="flex items-center gap-space-xs">
          {fx && (
            <span
              title={fx.live ? `Live Wise rate, quoted ${new Date(fx.fetchedAt).toLocaleTimeString('en-GB')}` : fx.note}
              className="hidden items-center gap-1.5 rounded-full bg-surface-container-high px-2.5 py-1 font-currency-tag text-currency-tag text-on-surface sm:inline-flex"
            >
              <span className={`h-2 w-2 rounded-full ${fx.live ? 'bg-[#37b000]' : 'bg-outline'}`} />
              1 {fx.source} = {fx.rate.toFixed(4)} {fx.target}
            </span>
          )}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              aria-label="Profile and demo settings"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-surface-container-high"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-forest font-label-bold text-label-bold text-primary-container">
                AM
              </span>
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-12 z-40 w-72 animate-pop-in rounded bg-surface-container-lowest p-2 shadow-xl">
                <div className="px-3 py-2">
                  <div className="font-label-bold text-label-bold text-on-surface">Alex Morgan · demo persona</div>
                  <div className="font-body-sm text-body-sm text-on-surface-variant">
                    Paid in GBP, lives in the Baltics and spends in EUR. Synthetic data: no real money moves.
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setMenuOpen(false);
                    void actions.reset();
                  }}
                  className="flex w-full items-center gap-3 rounded px-3 py-2.5 text-left font-label-bold text-label-bold text-on-surface hover:bg-surface-container-low disabled:opacity-50"
                >
                  <Icon name="restart_alt" className="text-[20px]" />
                  Reset demo
                </button>
                <a
                  href={`${import.meta.env.VITE_API_URL ?? ''}/api/state`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full items-center gap-3 rounded px-3 py-2.5 font-label-bold text-label-bold text-on-surface hover:bg-surface-container-low"
                >
                  <Icon name="data_object" className="text-[20px]" />
                  Open API state
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function Logo({ large }: { large?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <span className={`flex items-center justify-center rounded-full bg-primary-container text-forest ${large ? 'h-11 w-11' : 'h-8 w-8'}`}>
        <Icon name="waves" bold className={large ? 'text-[26px]' : 'text-[20px]'} />
      </span>
      <span className={`font-headline-md font-extrabold tracking-tight text-forest ${large ? 'text-[30px]' : 'text-[22px]'}`}>
        wise<span className="text-primary">flow</span>
      </span>
    </span>
  );
}

function BottomNav() {
  const { route, navigate } = useStore();
  return (
    <nav className="pb-safe z-30 shrink-0 bg-surface/90 shadow-[0_-1px_12px_rgba(0,0,0,0.04)] backdrop-blur-xl">
      <div className="flex h-16 items-center justify-around px-space-xs">
        {NAV.map((item) => {
          const active = route === item.route;
          return (
            <button
              key={item.route}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => navigate(item.route)}
              className={`flex h-11 flex-1 flex-col items-center justify-center transition-colors ${active ? 'font-bold text-primary' : 'text-on-surface-variant hover:text-on-surface'}`}
            >
              <Icon name={item.icon} filled={active} className="text-[22px]" />
              <span className="mt-0.5 font-currency-tag text-currency-tag">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}

function ToastView() {
  const { toast } = useStore();
  if (!toast) return null;
  const error = toast.tone === 'error';
  return (
    <div
      key={toast.id}
      role="status"
      className={`pointer-events-none absolute inset-x-4 bottom-20 z-50 flex animate-pop-in items-center gap-2 rounded px-4 py-3 shadow-lg ${error ? 'bg-error text-on-error' : 'bg-inverse-surface text-inverse-on-surface'}`}
    >
      <Icon name={error ? 'error' : 'check_circle'} filled className={`text-[20px] ${error ? '' : 'text-primary-container'}`} />
      <span className="font-label-bold text-label-bold">{toast.message}</span>
    </div>
  );
}

function Loading() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-on-surface-variant">
      <Spinner className="text-primary" />
      <span className="font-body-sm text-body-sm">Loading Wise Flow…</span>
    </div>
  );
}

function ConnectionError({ message, onRetry }: { message: string; onRetry(): Promise<void> }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-error-container text-on-error-container">
        <Icon name="cloud_off" className="text-[28px]" />
      </span>
      <div>
        <div className="font-title-sm text-title-sm text-on-surface">API unreachable</div>
        <p className="mt-1 font-body-sm text-body-sm text-on-surface-variant">{message}</p>
      </div>
      <PrimaryButton size="md" icon="refresh" className="max-w-[200px]" onClick={() => void onRetry()}>
        Retry
      </PrimaryButton>
    </div>
  );
}

/** Presenter panel next to the phone on wide screens: the 4 demo scenes and their status. */
function DemoGuide() {
  const { state, navigate } = useStore();
  const steps = demoSteps(state);
  return (
    <aside className="hidden w-[340px] shrink-0 flex-col gap-5 lg:flex">
      <Logo large />
      <p className="font-body-lg text-body-lg text-on-surface-variant">
        Your salary, planned before you spend it. Multi-currency jars with live Wise quotes.
      </p>
      <ol className="flex flex-col gap-2">
        {steps.map((step, index) => (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => navigate(step.route)}
              className={`flex w-full items-start gap-3 rounded p-3 text-left transition ${step.current ? 'bg-surface-container-lowest shadow-sm' : 'hover:bg-surface/60'}`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-label-bold text-label-bold ${
                  step.done
                    ? 'bg-primary text-on-primary'
                    : step.current
                      ? 'bg-primary-container text-on-primary-fixed'
                      : 'bg-surface-container-highest text-on-surface-variant'
                }`}
              >
                {step.done ? <Icon name="check" bold className="text-[16px]" /> : index + 1}
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="font-label-bold text-[14px] text-on-surface">{step.title}</span>
                <span className="font-body-sm text-body-sm text-on-surface-variant">{step.text}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
      <div className="rounded bg-surface/70 p-4 font-body-sm text-body-sm text-on-surface-variant">
        <div className="mb-1 font-label-bold text-label-bold text-on-surface">Architecture</div>
        React + Vite → Wise Flow API (Express) → Wise quotes API. Rules: fixed → savings → flexible; overspend only from flexible
        jars.
      </div>
    </aside>
  );
}

function demoSteps(state: AppState | null) {
  const phase = state?.phase;
  const purchases = state?.purchases ?? [];
  const rentQuote = state?.plan?.fxQuotes.find((q) => q.categoryId === 'rent');
  const rentText = rentQuote
    ? `rent ${money(rentQuote.targetAmount, rentQuote.target, 0)} = ${money(rentQuote.sourceAmount, rentQuote.source)}`
    : 'rent €800 = £X';
  const steps: Array<{ title: string; text: string; route: Route; done: boolean }> = [
    {
      title: 'Payday',
      text: `£2,000 lands → plan with a live Wise quote (${rentText}) → Approve`,
      route: 'plan',
      done: phase === 'active' || phase === 'closed',
    },
    {
      title: 'Purchase',
      text: 'Maxima → suggested Food → move part to Free Money in one tap',
      route: 'spend',
      done: purchases.some((p) => p.splits.some((s) => s.categoryId !== p.suggestedCategoryId)),
    },
    {
      title: 'Overspend',
      text: 'Food runs out → Free Money covers it. Rent and cushion untouched',
      route: 'spend',
      done: purchases.some((p) => p.coverage.length > 0),
    },
    {
      title: 'Month end',
      text: 'Leftovers sweep into the cushion: "You saved £X"',
      route: 'month-end',
      done: phase === 'closed',
    },
  ];
  const current = steps.findIndex((step) => !step.done);
  return steps.map((step, index) => ({ ...step, current: index === current }));
}
