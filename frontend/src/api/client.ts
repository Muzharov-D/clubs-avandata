const BASE = '/api/v1';

let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
  if (token) localStorage.setItem('avandata.auth.token', token);
  else localStorage.removeItem('avandata.auth.token');
}

export function getAccessToken(): string | null {
  if (accessToken) return accessToken;
  accessToken = localStorage.getItem('avandata.auth.token');
  return accessToken;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  auth?: boolean;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(opts.headers ?? {}),
  };
  if (opts.auth !== false) {
    const tok = getAccessToken();
    if (tok) headers.Authorization = `Bearer ${tok}`;
  }
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: 'include',
    signal: opts.signal,
  });
  if (res.status === 401 && opts.auth !== false) {
    // Try refresh once, then retry
    const refreshed = await tryRefresh();
    if (refreshed) {
      headers.Authorization = `Bearer ${getAccessToken()}`;
      const retry = await fetch(`${BASE}${path}`, {
        method: opts.method ?? 'GET',
        headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'include',
        signal: opts.signal,
      });
      return parseResponse<T>(retry);
    }
  }
  return parseResponse<T>(res);
}

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? (JSON.parse(text) as { error?: string; code?: string } & T) : ({} as T);
  if (!res.ok) {
    const d = data as { error?: string; code?: string };
    throw new ApiError(res.status, d.error ?? res.statusText, d.code);
  }
  return data as T;
}

let refreshPromise: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken?: string };
      if (data.accessToken) {
        setAccessToken(data.accessToken);
        return true;
      }
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();
  return refreshPromise;
}
