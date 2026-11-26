'use client';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

type Json = Record<string, any>;

function getTokens() {
  if (typeof window === 'undefined') return { accessToken: '', refreshToken: '' };
  return {
    accessToken: localStorage.getItem('xss_access') || '',
    refreshToken: localStorage.getItem('xss_refresh') || '',
  };
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem('xss_access', accessToken);
  localStorage.setItem('xss_refresh', refreshToken);
}

export function clearTokens() {
  localStorage.removeItem('xss_access');
  localStorage.removeItem('xss_refresh');
}

export function isLoggedIn() {
  return Boolean(getTokens().accessToken);
}

// Concurrent 401s share one refresh: refresh tokens are single-use on the API.
let refreshPromise: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const { refreshToken } = getTokens();
      if (!refreshToken) return false;
      const res = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    })()
      .catch(() => false)
      .finally(() => { refreshPromise = null; });
  }
  return refreshPromise;
}

async function request<T = any>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = getTokens();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && retry) {
    if (await refreshSession()) return request<T>(path, options, false);
    clearTokens();
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = await res.json();
      message = data.message || data.error || message;
    } catch {}
    throw new Error(message);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return res.json();
  return (await res.text()) as unknown as T;
}

async function downloadFile(path: string, filename: string, asText = false) {
  const { accessToken } = getTokens();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  const blob = asText
    ? new Blob([await res.text()], { type: 'text/csv;charset=utf-8' })
    : await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export const api = {
  get: <T = any>(path: string, options?: RequestInit) => request<T>(path, options),
  post: <T = any>(path: string, body?: Json) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(path: string, body?: Json) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
  downloadCsv: (path: string, filename: string) => downloadFile(path, filename, true),
  download: (path: string, filename: string) => downloadFile(path, filename),
};

export async function login(email: string, password: string) {
  const data = await api.post('/api/auth/login', { email, password });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}
