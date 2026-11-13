import { describe, expect, it } from 'vitest';
import { createWiseProvider, parseWiseQuote, withFallback, type FxProvider } from '../src/wise/fx';

const now = new Date('2026-11-13T13:40:12Z');

// Trimmed from a real response of POST https://api.wise.com/v3/quotes.
const wiseQuote = {
  rate: 1.19717,
  sourceAmount: null,
  targetAmount: 800,
  expirationTime: '2026-11-13T14:10:12Z',
  paymentOptions: [
    { disabled: true, payIn: 'BALANCE', payOut: 'BANK_TRANSFER', sourceAmount: 668.32, targetAmount: 800, fee: { total: 0 } },
    { disabled: false, payIn: 'DEBIT', payOut: 'BANK_TRANSFER', sourceAmount: 673.16, targetAmount: 800, fee: { total: 4.84 } },
    { disabled: false, payIn: 'BANK_TRANSFER', payOut: 'BANK_TRANSFER', sourceAmount: 671.04, targetAmount: 800, fee: { total: 2.72 } },
  ],
};

const fakeFetch = (handler: (url: string) => unknown, calls: Array<{ url: string; init?: RequestInit }>) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify(handler(String(url))), { status: 200 });
  }) as typeof fetch;

describe('Wise quotes', () => {
  it('maps a quote, preferring an enabled bank-transfer option', () => {
    const quote = parseWiseQuote(wiseQuote, { source: 'GBP', target: 'EUR', targetAmount: 800, categoryId: 'rent' }, 'wise', now);
    expect(quote).toMatchObject({
      categoryId: 'rent',
      rate: 1.19717,
      sourceAmount: 671.04,
      targetAmount: 800,
      fee: 2.72,
      live: true,
      expiresAt: '2026-11-13T14:10:12Z',
    });
  });

  it('uses the public endpoint when there is no token', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const provider = createWiseProvider({ baseUrl: 'https://api.wise.com/', fetchImpl: fakeFetch(() => wiseQuote, calls), now: () => now });

    const quote = await provider.quote({ source: 'GBP', target: 'EUR', targetAmount: 800 });

    expect(calls[0].url).toBe('https://api.wise.com/v3/quotes');
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ sourceCurrency: 'GBP', targetCurrency: 'EUR', targetAmount: 800 });
    expect(quote).toMatchObject({ provider: 'wise', sourceAmount: 671.04 });
  });

  it('creates a profile quote in the sandbox when a token is set', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const handler = (url: string) =>
      url.endsWith('/v2/profiles') ? [{ id: 7, type: 'BUSINESS' }, { id: 42, type: 'PERSONAL' }] : { ...wiseQuote, id: 'q-1' };
    const provider = createWiseProvider({
      baseUrl: 'https://api.wise-sandbox.com',
      token: 'secret',
      fetchImpl: fakeFetch(handler, calls),
      now: () => now,
    });

    const quote = await provider.quote({ source: 'GBP', target: 'EUR', targetAmount: 800 });

    expect(calls.map((c) => c.url)).toEqual([
      'https://api.wise-sandbox.com/v2/profiles',
      'https://api.wise-sandbox.com/v3/profiles/42/quotes',
    ]);
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe('Bearer secret');
    expect(quote).toMatchObject({ id: 'q-1', provider: 'wise-sandbox' });
  });

  it('falls back to the last live Wise rate when the API fails', async () => {
    let down = false;
    const primary: FxProvider = {
      description: 'wise',
      quote: async (request) => {
        if (down) throw new Error('network down');
        return parseWiseQuote(wiseQuote, request, 'wise', now);
      },
    };
    const fx = withFallback(primary, { now: () => now });

    await fx.quote({ source: 'GBP', target: 'EUR', targetAmount: 800 });
    down = true;
    const quote = await fx.quote({ source: 'GBP', target: 'EUR', targetAmount: 140 });

    expect(quote).toMatchObject({ provider: 'fallback', live: false, rate: 1.19717 });
    expect(quote.sourceAmount).toBeCloseTo((140 / 1.19717) * (1 + 2.72 / 668.32), 2);
    expect(quote.note).toContain('network down');
  });

  it('uses an approximate rate when offline and nothing is cached', async () => {
    const quote = await withFallback(null, { offline: true, now: () => now }).quote({ source: 'GBP', target: 'EUR', targetAmount: 800 });
    expect(quote).toMatchObject({ provider: 'fallback', live: false, rate: 1.19, targetAmount: 800 });
  });
});
