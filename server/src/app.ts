import { existsSync } from 'node:fs';
import path from 'node:path';
import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { DomainError } from './engine/errors';
import type { WiseFlowService } from './service';
import { FxError } from './wise/fx';

export interface AppOptions {
  /** Built web app (web/dist) to serve next to the API. */
  webDist?: string;
}

export function createApp(service: WiseFlowService, options: AppOptions = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(cors());
  app.use(express.json({ limit: '64kb' }));

  const api = express.Router();
  api.get('/health', (_req, res) => {
    res.json({ ok: true, fx: service.fxDescription });
  });
  api.get('/state', (_req, res) => {
    res.json(service.getState());
  });
  api.post('/payday', async (req, res) => {
    res.json(await service.payday(req.body));
  });
  api.get('/plan', (_req, res) => {
    res.json(service.getPlan());
  });
  api.post('/plan/approve', (_req, res) => {
    res.json(service.approve());
  });
  api.get('/categories', (_req, res) => {
    res.json(service.categories());
  });
  api.get('/purchases', (_req, res) => {
    res.json(service.purchases());
  });
  api.post('/purchases', async (req, res) => {
    res.status(201).json(await service.createPurchase(req.body));
  });
  api.post('/purchases/:id/split', (req, res) => {
    res.json(service.split(req.params.id, req.body));
  });
  api.post('/month-end', (_req, res) => {
    res.json(service.monthEnd());
  });
  api.get('/forecast', (_req, res) => {
    res.json(service.forecast());
  });
  api.get('/merchants', (_req, res) => {
    res.json(service.merchants());
  });
  api.get('/fx/quote', async (req, res) => {
    res.json(await service.quote(req.query));
  });
  api.post('/demo/reset', (_req, res) => {
    res.json(service.reset());
  });
  api.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Unknown API route.' } });
  });
  app.use('/api', api);

  const webDist = options.webDist;
  if (webDist && existsSync(path.join(webDist, 'index.html'))) {
    app.use(express.static(webDist));
    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      // `root` keeps dot-folders in the absolute path (e.g. ~/.config) from being rejected by `send`.
      res.sendFile('index.html', { root: webDist });
    });
  }

  app.use(errorHandler);
  return app;
}

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof DomainError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message } });
    return;
  }
  if (error instanceof FxError) {
    res.status(502).json({ error: { code: 'FX_UNAVAILABLE', message: error.message } });
    return;
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
    return;
  }
  const status = Number(error?.status ?? error?.statusCode);
  if (status >= 400 && status < 500) {
    res.status(status).json({ error: { code: `HTTP_${status}`, message: error.message ?? 'Request failed.' } });
    return;
  }
  console.error(error);
  res.status(500).json({ error: { code: 'INTERNAL', message: 'Something went wrong.' } });
};
