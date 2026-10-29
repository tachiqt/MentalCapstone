/**
 * API client that mirrors mobile-rn/lib/api.ts request behavior, so a passing
 * check here means the real app client would also succeed.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(HERE, '..', '..');

function readEnvFile() {
  try {
    const raw = readFileSync(resolve(PROJECT_ROOT, '.env'), 'utf8');
    const out = {};
    raw.split(/\r?\n/).forEach((line) => {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!match) return;
      out[match[1]] = match[2].replace(/^["']|["']$/g, '');
    });
    return out;
  } catch {
    return {};
  }
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] || null;
}

/** Resolution order: --base flag → SMARTCARE_API_URL → .env EXPO_PUBLIC_API_URL. */
export function resolveBaseUrl() {
  const env = readEnvFile();
  const raw =
    argValue('--base') ||
    process.env.SMARTCARE_API_URL ||
    env.EXPO_PUBLIC_API_URL ||
    'http://127.0.0.1:8000/api/v1';
  return raw.trim().replace(/\/+$/, '');
}

export const BASE_URL = resolveBaseUrl();

export function getAssetBaseUrl() {
  return BASE_URL.replace(/\/api\/v1\/?$/, '');
}

/** Mirrors resolveMediaUrl in mobile-rn/lib/config.ts. */
export function resolveMediaUrl(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  const base = getAssetBaseUrl();
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Mirrors parseApiError in mobile-rn/lib/config.ts. */
export function parseApiError(payload, status) {
  if (payload?.message) return payload.message;
  if (payload?.errors) return Object.values(payload.errors).flat().join('\n');
  return `Request failed (${status})`;
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
  }
}

export class NetworkError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NetworkError';
  }
}

/**
 * Performs a request the same way mobile-rn/lib/api.ts does.
 * Pass `token` explicitly instead of reading SecureStore.
 */
export async function api(endpoint, { method = 'GET', body, headers = {}, token = null } = {}) {
  let res;
  try {
    res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    throw new NetworkError(
      `Cannot reach SmartCare server at ${BASE_URL}. Is the backend running? (${err.message})`
    );
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError(parseApiError(payload, res.status), res.status, payload);
  }

  return payload;
}

/** Builds a token-bound client so suites read like the app's call sites. */
export function withToken(token) {
  return (endpoint, options = {}) => api(endpoint, { ...options, token });
}

/**
 * Laravel resources are returned either bare or wrapped in `{ data }`.
 * Every mobile screen tolerates both, so tests must too.
 */
export function unwrap(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return payload;
}

export function unwrapList(payload) {
  const value = unwrap(payload);
  return Array.isArray(value) ? value : [];
}
