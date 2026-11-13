import type { FxQuote } from '../../../shared/types';
import { round2 } from '../engine/money';

export interface QuoteRequest {
  source: string;
  target: string;
  targetAmount?: number;
  sourceAmount?: number;
  categoryId?: string;
}

export interface FxProvider {
  readonly description: string;
  quote(request: QuoteRequest): Promise<FxQuote>;
}

export class FxError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'FxError';
    this.status = status;
  }
}

export interface WiseProviderOptions {
  /** https://api.wise.com (live, public quotes) or https://api.wise-sandbox.com (needs a token). */
  baseUrl: string;
  token?: string;
  profileId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
}

interface WisePaymentOption {
  disabled?: boolean;
  payIn?: string;
  payOut?: string;
  sourceAmount?: number | null;
  targetAmount?: number | null;
  fee?: { total?: number | null } | null;
}

interface WiseQuoteResponse {
  id?: string | number;
  rate?: number;
  sourceAmount?: number | null;
  targetAmount?: number | null;
  expirationTime?: string;
  rateExpirationTime?: string;
  paymentOptions?: WisePaymentOption[];
}

/**
 * Wise quotes. Without a token it uses the public, unauthenticated `POST /v3/quotes`
 * (real Wise rate and fee, cannot be used for a transfer). With a token it creates a
 * profile quote, e.g. against the sandbox at https://api.wise-sandbox.com.
 */
export function createWiseProvider(options: WiseProviderOptions): FxProvider {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const provider: FxQuote['provider'] = /sandbox/i.test(baseUrl) ? 'wise-sandbox' : 'wise';
  const timeoutMs = options.timeoutMs ?? 5000;
  let profileId = options.profileId;

  async function call<T>(path: string, init: { method: string; body?: string }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        method: init.method,
        body: init.body,
        signal: controller.signal,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
      });
      if (!response.ok) {
        throw new FxError(`Wise API ${init.method} ${path} failed with HTTP ${response.status}`, response.status);
      }
      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof FxError) throw error;
      if (controller.signal.aborted) throw new FxError(`Wise API timed out after ${timeoutMs} ms`);
      throw new FxError(`Wise API unreachable: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      clearTimeout(timer);
    }
  }

  async function resolveProfileId(): Promise<string> {
    if (profileId) return profileId;
    const profiles = await call<Array<{ id?: number | string; type?: string }>>('/v2/profiles', { method: 'GET' });
    const list = Array.isArray(profiles) ? profiles : [];
    const profile = list.find((p) => String(p.type).toLowerCase() === 'personal') ?? list[0];
    if (profile?.id == null) throw new FxError('No Wise profile found for this API token');
    profileId = String(profile.id);
    return profileId;
  }

  return {
    description: options.token
      ? `Wise ${provider === 'wise-sandbox' ? 'sandbox' : 'API'} quotes with token (${baseUrl})`
      : `Wise public quotes (${baseUrl}, no token)`,
    async quote(request) {
      const body = {
        sourceCurrency: request.source,
        targetCurrency: request.target,
        ...(request.targetAmount != null ? { targetAmount: request.targetAmount } : { sourceAmount: request.sourceAmount }),
      };
      const path = options.token ? `/v3/profiles/${await resolveProfileId()}/quotes` : '/v3/quotes';
      const json = await call<WiseQuoteResponse>(path, { method: 'POST', body: JSON.stringify(body) });
      return parseWiseQuote(json, request, provider, now());
    },
  };
}

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

/** Maps a Wise v3 quote to our FxQuote. Prefers paying from a Wise balance, then bank transfer. */
export function parseWiseQuote(
  json: WiseQuoteResponse,
  request: QuoteRequest,
  provider: FxQuote['provider'],
  now: Date,
): FxQuote {
  const rate = finite(json?.rate);
  if (!rate || rate <= 0) throw new FxError('Wise quote response has no rate');

  const options = (Array.isArray(json.paymentOptions) ? json.paymentOptions : []).filter((o) => o && !o.disabled);
  const option =
    options.find((o) => o.payIn === 'BALANCE') ?? options.find((o) => o.payIn === 'BANK_TRANSFER') ?? options[0];

  const targetAmount =
    finite(option?.targetAmount) ??
    finite(json.targetAmount) ??
    (request.sourceAmount != null ? request.sourceAmount * rate : undefined);
  const sourceAmount =
    finite(option?.sourceAmount) ?? finite(json.sourceAmount) ?? (targetAmount != null ? targetAmount / rate : undefined);
  if (sourceAmount == null || targetAmount == null) throw new FxError('Wise quote response has no amounts');

  return {
    id: json.id != null ? String(json.id) : `wise_${now.getTime().toString(36)}_${request.categoryId ?? request.target}`,
    ...(request.categoryId ? { categoryId: request.categoryId } : {}),
    source: request.source,
    target: request.target,
    rate,
    sourceAmount: round2(sourceAmount),
    targetAmount: round2(targetAmount),
    fee: round2(finite(option?.fee?.total) ?? 0),
    provider,
    live: true,
    fetchedAt: now.toISOString(),
    ...(json.expirationTime || json.rateExpirationTime ? { expiresAt: json.expirationTime ?? json.rateExpirationTime } : {}),
  };
}

/** Approximate rates used only when the Wise API cannot be reached and nothing is cached. */
export const OFFLINE_RATES: Record<string, number> = {
  'GBP>EUR': 1.19,
  'GBP>USD': 1.31,
  'EUR>USD': 1.1,
};
const DEFAULT_FEE_RATIO = 0.0035;
const RETRY_AFTER_FAILURE_MS = 30_000;

export interface FallbackOptions {
  /** Never call Wise (FX_MODE=offline), e.g. to rehearse the demo without network. */
  offline?: boolean;
  now?: () => Date;
}

/**
 * Keeps the demo alive when Wise is unreachable: reuses the last live Wise rate for the pair,
 * or an approximate offline rate, and marks the quote as not live. After a failure Wise is
 * skipped for 30 seconds so the UI doesn't wait for repeated timeouts.
 */
export function withFallback(primary: FxProvider | null, options: FallbackOptions = {}): FxProvider {
  const now = options.now ?? (() => new Date());
  const lastLive = new Map<string, FxQuote>();
  let skipUntil = 0;

  return {
    description:
      primary && !options.offline ? `${primary.description}, offline fallback enabled` : 'Offline demo rates (Wise API disabled)',
    async quote(request) {
      const pair = `${request.source}>${request.target}`;
      let reason = 'Wise API disabled';
      if (primary && !options.offline) {
        if (now().getTime() >= skipUntil) {
          try {
            const quote = await primary.quote(request);
            lastLive.set(pair, quote);
            return quote;
          } catch (error) {
            skipUntil = now().getTime() + RETRY_AFTER_FAILURE_MS;
            reason = error instanceof Error ? error.message : String(error);
          }
        } else {
          reason = 'Wise API failed recently, retrying shortly';
        }
      }

      const cached = lastLive.get(pair);
      const rate = cached?.rate ?? offlineRate(request.source, request.target);
      if (!rate) throw new FxError(`No ${pair} rate available (${reason})`);
      const feeRatio =
        cached && cached.sourceAmount > cached.fee ? cached.fee / (cached.sourceAmount - cached.fee) : DEFAULT_FEE_RATIO;

      let sourceAmount: number;
      let targetAmount: number;
      let fee: number;
      if (request.targetAmount != null) {
        const base = request.targetAmount / rate;
        fee = base * feeRatio;
        sourceAmount = base + fee;
        targetAmount = request.targetAmount;
      } else {
        sourceAmount = request.sourceAmount ?? 0;
        fee = (sourceAmount * feeRatio) / (1 + feeRatio);
        targetAmount = (sourceAmount - fee) * rate;
      }

      const fetchedAt = now();
      return {
        id: `fallback_${fetchedAt.getTime().toString(36)}_${request.categoryId ?? request.target}`,
        ...(request.categoryId ? { categoryId: request.categoryId } : {}),
        source: request.source,
        target: request.target,
        rate,
        sourceAmount: round2(sourceAmount),
        targetAmount: round2(targetAmount),
        fee: round2(fee),
        provider: 'fallback',
        live: false,
        fetchedAt: fetchedAt.toISOString(),
        note: cached
          ? `${reason}. Using the last live Wise rate from ${cached.fetchedAt}.`
          : `${reason}. Using an approximate offline rate.`,
      };
    },
  };
}

function offlineRate(source: string, target: string): number | undefined {
  if (source === target) return 1;
  const direct = OFFLINE_RATES[`${source}>${target}`];
  if (direct) return direct;
  const inverse = OFFLINE_RATES[`${target}>${source}`];
  return inverse ? 1 / inverse : undefined;
}
