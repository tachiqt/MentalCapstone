import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getDevHost(): string | null {
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    (Constants as { manifest?: { debuggerHost?: string } }).manifest?.debuggerHost;

  if (!hostUri) return null;
  return hostUri.split(':')[0] || null;
}

function getDevApiBase(): string {
  const host = getDevHost();

  // Prefer Metro's advertised host (LAN IP for physical devices / wireless debugging).
  if (host && host !== 'localhost' && host !== '127.0.0.1') {
    return `http://${host}:8000/api/v1`;
  }

  // Android emulator maps the host machine to 10.0.2.2
  if (Platform.OS === 'android') {
    return 'http://10.0.2.2:8000/api/v1';
  }

  return 'http://127.0.0.1:8000/api/v1';
}

const PRODUCTION_API_URL = 'https://smartcare-zdi2psmkca-as.a.run.app/api/v1';

const envApiBase = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');

export const API_BASE_URL = envApiBase
  ? envApiBase
  : __DEV__
    ? getDevApiBase()
    : PRODUCTION_API_URL;

export function getAssetBaseUrl(): string {
  return API_BASE_URL.replace(/\/api\/v1\/?$/, '');
}

/**
 * Turns a media value from the API into something a fetch/Image/WebView can load.
 *
 * Backend media URLs are absolute: public GCS in production, or `APP_URL/storage/...`
 * on a local public-disk install. In Expo dev, APP_URL is often `http://127.0.0.1:8000`
 * while the device talks to the API via LAN IP or Android's `10.0.2.2`, so localhost
 * hosts are rewritten to the reachable asset base.
 *
 * Leading-slash paths are served from the API host. Bare storage keys like
 * `learning-materials/x.jpg` are mapped under `/storage/`.
 */
export function resolveMediaUrl(path?: string | null): string | null {
  if (!path) return null;
  const raw = path.trim();
  if (!raw) return null;

  const assetBase = getAssetBaseUrl();
  let url = raw;

  if (/^https?:\/\//i.test(raw)) {
    url = raw;
  } else if (raw.startsWith('/')) {
    url = `${assetBase}${raw}`;
  } else {
    url = `${assetBase}/storage/${raw.replace(/^\/+/, '')}`;
  }

  if (__DEV__) {
    url = url.replace(/^https?:\/\/(127\.0\.0\.1|localhost)(?::\d+)?/i, assetBase);
  }

  return url;
}

export function parseApiError(payload: any, status: number): string {
  if (payload?.message) return payload.message;
  if (payload?.errors) {
    return Object.values(payload.errors).flat().join('\n');
  }
  return `Request failed (${status})`;
}
