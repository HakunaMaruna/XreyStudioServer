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

async function request<T = any>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const { accessToken } = getTokens();
  const headers: Record<string, string> = {
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401 && retry) {
    const { refreshToken } = getTokens();
    if (refreshToken) {
      const refreshed = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (refreshed.ok) {
        const data = await refreshed.json();
        setTokens(data.accessToken, data.refreshToken);
        return request<T>(path, options, false);
      }
    }
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

export const api = {
  get: <T = any>(path: string) => request<T>(path),
  post: <T = any>(path: string, body?: Json) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T = any>(path: string, body?: Json) =>
    request<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  delete: <T = any>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export async function login(email: string, password: string) {
  const data = await api.post('/api/auth/login', { email, password });
  setTokens(data.accessToken, data.refreshToken);
  return data;
}
