import { ApiResponse } from '../types';

export const BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

// Detect and persist auth token from URL (handles cross-domain OAuth redirects)
if (typeof window !== 'undefined') {
  const urlParams = new URLSearchParams(window.location.search);
  const tokenParam = urlParams.get('token');
  if (tokenParam) {
    localStorage.setItem('auth_token', tokenParam);
    urlParams.delete('token');
    const cleanSearch = urlParams.toString() ? `?${urlParams.toString()}` : '';
    window.history.replaceState({}, document.title, `${window.location.pathname}${cleanSearch}`);
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  
  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Attach bearer token if stored
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : null;
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include', // Include HTTP-only cookies
  });

  const json: ApiResponse<T> = await response.json();

  if (!response.ok || !json.success) {
    const errorMsg = json.error?.message || `Request failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  return json.data;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint, { method: 'GET' }),
  post: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body),
    }),
  put: <T>(endpoint: string, body?: unknown) =>
    request<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: <T>(endpoint: string) => request<T>(endpoint, { method: 'DELETE' }),
};
