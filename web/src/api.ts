import type {
  ApiErrorBody,
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

/** Leave empty to use the same origin (Vite proxies /api to the server in dev). */
const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "Can't reach the Wise Flow API. Is the server running (npm run dev)?");
  }
  const data = (await response.json().catch(() => null)) as (T & Partial<ApiErrorBody>) | null;
  if (!response.ok && !data?.error) {
    throw new ApiError(response.status, 'NETWORK', `Can't reach the Wise Flow API (HTTP ${response.status}). Is the server running (npm run dev)?`);
  }
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error?.code ?? `HTTP_${response.status}`,
      data?.error?.message ?? `Request failed with HTTP ${response.status}.`,
    );
  }
  return data as T;
}

export const api = {
  state: () => request<AppState>('GET', '/state'),
  forecast: () => request<Forecast>('GET', '/forecast'),
  merchants: () => request<MerchantInfo[]>('GET', '/merchants'),
  payday: (body: PaydayRequest) => request<Plan>('POST', '/payday', body),
  approve: () => request<Plan>('POST', '/plan/approve'),
  purchase: (body: PurchaseRequest) => request<PurchaseResult>('POST', '/purchases', body),
  split: (id: string, splits: Split[]) => request<PurchaseResult>('POST', `/purchases/${encodeURIComponent(id)}/split`, { splits }),
  monthEnd: () => request<MonthEndResult>('POST', '/month-end'),
  reset: () => request<AppState>('POST', '/demo/reset'),
};
