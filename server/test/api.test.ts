import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Category } from '../../shared/types';
import { createApp } from '../src/app';
import { WiseFlowService } from '../src/service';
import { withFallback, type FxProvider } from '../src/wise/fx';

const now = () => new Date('2026-11-13T10:00:00Z');

function setup() {
  const service = new WiseFlowService({ fx: withFallback(null, { offline: true, now }), now });
  return request(createApp(service));
}

const byId = (categories: Category[]) => Object.fromEntries(categories.map((c) => [c.id, c]));
const round2 = (value: number) => Math.round(value * 100) / 100;

describe('Wise Flow API', () => {
  it('runs the demo: payday → approve → purchase → move to Free Money → overspend → month end', async () => {
    const api = setup();

    const draft = await api.post('/api/payday').send({ amount: 2000, currency: 'GBP' }).expect(200);
    expect(draft.body.status).toBe('draft');
    expect(draft.body.categories.reduce((sum: number, c: Category) => sum + c.allocated, 0)).toBeCloseTo(2000, 2);
    expect(draft.body.warnings.map((w: { code: string }) => w.code)).toContain('FX_FALLBACK');

    await api.post('/api/purchases').send({ merchant: 'Maxima', amount: 10 }).expect(409);
    await api.post('/api/plan/approve').expect(200);

    const bought = await api.post('/api/purchases').send({ merchant: 'Maxima', amount: 42.3, currency: 'EUR' }).expect(201);
    const { id, amount } = bought.body.purchase;
    expect(bought.body.purchase).toMatchObject({ suggestedCategoryId: 'food', original: { amount: 42.3, currency: 'EUR' } });

    const moved = await api
      .post(`/api/purchases/${id}/split`)
      .send({ splits: [{ categoryId: 'food', amount: round2(amount - 10) }, { categoryId: 'free', amount: 10 }] })
      .expect(200);
    expect(moved.body.purchase.splits).toEqual([
      { categoryId: 'food', amount: round2(amount - 10) },
      { categoryId: 'free', amount: 10 },
    ]);
    await api.post(`/api/purchases/${id}/split`).send({ splits: [{ categoryId: 'cushion', amount }] }).expect(400);

    const overspend = await api.post('/api/purchases').send({ merchant: 'Maxima', amount: 400 }).expect(201);
    expect(overspend.body.purchase.coverage[0]).toMatchObject({ fromCategoryId: 'free', toCategoryId: 'food' });

    const jars = byId((await api.get('/api/categories').expect(200)).body);
    expect(jars.food.remaining).toBe(0);
    expect(jars.rent.remaining).toBe(jars.rent.allocated);
    expect(jars.utilities.remaining).toBe(jars.utilities.allocated);
    expect(jars.cushion.remaining).toBe(jars.cushion.allocated);

    const closed = await api.post('/api/month-end').expect(200);
    expect(closed.body).toMatchObject({ final: true, month: '2026-11' });
    expect(closed.body.saved).toBeCloseTo(jars.car.remaining + jars.free.remaining, 2);
    expect(closed.body.cushionAfter).toBeCloseTo(1250 + jars.cushion.allocated + closed.body.saved, 2);
    expect((await api.get('/api/state')).body.phase).toBe('closed');

    const next = await api.post('/api/payday').send({ amount: 2000 }).expect(200);
    expect(next.body.month).toBe('2026-12');
    expect((await api.get('/api/forecast')).body.historyMonths).toEqual(['2026-09', '2026-10', '2026-11']);
  });

  it('rejects invalid requests', async () => {
    const api = setup();
    await api.post('/api/payday').send({ amount: -5 }).expect(400);
    await api.post('/api/payday').send({ amount: 2000, currency: 'USD' }).expect(400);
    await api.post('/api/payday').send({ amount: 2000, overrides: { rent: 10 } }).expect(400);
    await api.post('/api/payday').set('Content-Type', 'application/json').send('{"amount":').expect(400);
    await api.post('/api/plan/approve').expect(409);
    await api.post('/api/month-end').expect(409);
    await api.get('/api/nope').expect(404);
  });

  it('serves the web app for deep links, even when it lives under a dot-folder', async () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'wise-flow-'));
    try {
      const webDist = path.join(dir, '.hidden', 'dist');
      mkdirSync(webDist, { recursive: true });
      writeFileSync(path.join(webDist, 'index.html'), '<div id="root"></div>');
      const service = new WiseFlowService({ fx: withFallback(null, { offline: true, now }), now });
      const api = request(createApp(service, { webDist }));

      expect((await api.get('/plan/anything').expect(200)).text).toContain('id="root"');
      await api.get('/api/nope').expect(404);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('WiseFlowService', () => {
  const offline = withFallback(null, { offline: true, now });
  const slowFx: FxProvider = {
    description: 'slow Wise',
    quote: async (request) => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return offline.quote(request);
    },
  };

  it('does not let a slow Wise quote overwrite an approval made meanwhile', async () => {
    const service = new WiseFlowService({ fx: slowFx, now });
    await service.payday({ amount: 2000 });

    const refresh = service.payday({ amount: 2000, savingsRate: 0.05, refreshQuotes: true });
    const approval = service.approve();
    await Promise.all([refresh, approval]);

    const state = service.getState();
    expect(state.phase).toBe('active');
    expect(state.plan?.savingsRate).toBe(0.05);
  });

  it('handles a reset while a payday is waiting for Wise', async () => {
    const service = new WiseFlowService({ fx: slowFx, now });
    const payday = service.payday({ amount: 2000 });
    const reset = service.reset();

    await expect(payday).resolves.toMatchObject({ status: 'draft' });
    await expect(reset).resolves.toMatchObject({ phase: 'awaiting-payday', plan: null });
  });
});
