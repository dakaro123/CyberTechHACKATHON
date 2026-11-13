import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type {
  AppState,
  Forecast,
  MerchantInfo,
  MonthEndResult,
  PaydayRequest,
  Plan,
  PurchaseRequest,
  PurchaseResult,
  Split,
} from '../../shared/types';
import { api } from './api';
import { money, monthName } from './format';

export type Route = 'home' | 'plan' | 'spend' | 'insights' | 'month-end';
const ROUTES: Route[] = ['home', 'plan', 'spend', 'insights', 'month-end'];

const readRoute = (): Route => {
  const route = window.location.hash.replace(/^#\/?/, '');
  return (ROUTES as string[]).includes(route) ? (route as Route) : 'home';
};

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

interface Actions {
  payday(request: PaydayRequest): Promise<Plan | undefined>;
  approve(): Promise<Plan | undefined>;
  purchase(request: PurchaseRequest): Promise<PurchaseResult | undefined>;
  split(id: string, splits: Split[], message?: string): Promise<PurchaseResult | undefined>;
  monthEnd(): Promise<MonthEndResult | undefined>;
  reset(): Promise<void>;
}

interface Store {
  state: AppState | null;
  forecast: Forecast | null;
  merchants: MerchantInfo[];
  connectionError: string | null;
  busy: boolean;
  route: Route;
  navigate(route: Route): void;
  selectedPurchaseId: string | null;
  openPurchase(id: string): void;
  closePurchase(): void;
  toast: Toast | null;
  notify(message: string, tone?: Toast['tone']): void;
  reload(): Promise<void>;
  actions: Actions;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [forecast, setForecast] = useState<Forecast | null>(null);
  const [merchants, setMerchants] = useState<MerchantInfo[]>([]);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);
  const busy = pending > 0;
  const [route, setRoute] = useState<Route>(readRoute);
  const [selectedPurchaseId, setSelectedPurchaseId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    const onHashChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = useCallback((next: Route) => {
    if (window.location.hash !== `#/${next}`) window.location.hash = `/${next}`;
    setRoute(next);
  }, []);

  const closePurchase = useCallback(() => setSelectedPurchaseId(null), []);

  const notify = useCallback((message: string, tone: Toast['tone'] = 'success') => {
    setToast({ id: Date.now(), message, tone });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const merchantsLoaded = useRef(false);
  const reload = useCallback(async () => {
    try {
      const [nextState, nextForecast] = await Promise.all([api.state(), api.forecast()]);
      setState(nextState);
      setForecast(nextForecast);
      setConnectionError(null);
      if (!merchantsLoaded.current) {
        merchantsLoaded.current = true;
        api
          .merchants()
          .then(setMerchants)
          .catch(() => {
            merchantsLoaded.current = false;
          });
      }
    } catch (error) {
      setConnectionError(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const run = useCallback(
    async <T,>(call: () => Promise<T>, success?: (result: T) => string | undefined): Promise<T | undefined> => {
      setPending((count) => count + 1);
      try {
        const result = await call();
        await reload();
        const message = success?.(result);
        if (message) notify(message);
        return result;
      } catch (error) {
        notify(error instanceof Error ? error.message : String(error), 'error');
        return undefined;
      } finally {
        setPending((count) => count - 1);
      }
    },
    [notify, reload],
  );

  const actions = useMemo<Actions>(
    () => ({
      payday: (request) => run(() => api.payday(request)),
      approve: () =>
        run(api.approve, (plan) => `${monthName(plan.month)} plan approved: ${plan.categories.length} jars created`),
      purchase: (request) => run(() => api.purchase(request)),
      split: (id, splits, message) => run(() => api.split(id, splits), () => message),
      monthEnd: () => run(api.monthEnd, (result) => `${money(result.saved)} swept into your cushion`),
      reset: async () => {
        await run(api.reset, () => 'Demo reset: waiting for payday');
        setSelectedPurchaseId(null);
        navigate('home');
      },
    }),
    [navigate, run],
  );

  const value: Store = {
    state,
    forecast,
    merchants,
    connectionError,
    busy,
    route,
    navigate,
    selectedPurchaseId,
    openPurchase: setSelectedPurchaseId,
    closePurchase,
    toast,
    notify,
    reload,
    actions,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const store = useContext(StoreContext);
  if (!store) throw new Error('useStore must be used inside <StoreProvider>');
  return store;
}

/** Like useStore, for screens that render only once the state has loaded. */
export function useLoadedStore(): Store & { state: AppState } {
  const store = useStore();
  if (!store.state) throw new Error('State not loaded yet');
  return store as Store & { state: AppState };
}
