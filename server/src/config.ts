import { createWiseProvider, withFallback, type FxProvider } from './wise/fx';

export interface AppConfig {
  port: number;
  fxMode: 'live' | 'offline';
  wise: {
    baseUrl: string;
    token?: string;
    profileId?: string;
    timeoutMs: number;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const token = env.WISE_API_TOKEN?.trim() || undefined;
  return {
    port: Number(env.PORT) || 8787,
    fxMode: env.FX_MODE?.trim().toLowerCase() === 'offline' ? 'offline' : 'live',
    wise: {
      // Public quotes need no token; a token defaults to the Wise sandbox.
      baseUrl: env.WISE_API_BASE?.trim() || (token ? 'https://api.wise-sandbox.com' : 'https://api.wise.com'),
      token,
      profileId: env.WISE_PROFILE_ID?.trim() || undefined,
      timeoutMs: Number(env.WISE_TIMEOUT_MS) || 5000,
    },
  };
}

export function createFxProvider(config: AppConfig): FxProvider {
  return withFallback(createWiseProvider(config.wise), { offline: config.fxMode === 'offline' });
}
