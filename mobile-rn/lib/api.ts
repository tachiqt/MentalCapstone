import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL, parseApiError } from './config';

export async function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync('auth_token');
}

export async function setToken(token: string): Promise<void> {
  await SecureStore.setItemAsync('auth_token', token);
}

export async function removeToken(): Promise<void> {
  await SecureStore.deleteItemAsync('auth_token');
}

type RequestOptions = {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
};

/**
 * Carries the status and decoded body alongside the message so callers can act
 * on a specific failure (an unverified account, say) without matching on prose.
 */
export class ApiError extends Error {
  readonly status: number;

  readonly payload: any;

  constructor(message: string, status: number, payload: any) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export async function api<T = any>(
  endpoint: string,
  options: RequestOptions = {}
): Promise<T> {
  const token = await getToken();
  const { method = 'GET', body, headers = {} } = options;
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body
        ? { body: isFormData ? body : JSON.stringify(body) }
        : {}),
    });
  } catch (err) {
    const detail = err instanceof Error && err.message ? ` (${err.message})` : '';
    throw new Error(
      `Cannot reach SmartCare at ${API_BASE_URL}${detail}. Check your network connection and that the API is online.`
    );
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(parseApiError(error, res.status), res.status, error);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return res.json();
}

/** Absolute API URL for a relative path like `/progress-photos/1/file`. */
export function apiUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalized}`;
}
