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

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new Error('Cannot reach SmartCare server. Make sure the backend is running on port 8000.');
  }

  if (!res.ok) {
    const error = await res.json().catch(() => ({}));
    throw new ApiError(parseApiError(error, res.status), res.status, error);
  }

  return res.json();
}
