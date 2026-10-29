/**
 * Remote app configuration from GET /app-config.
 *
 * Mirrors the web dashboard (js/dashboard/boot.js + core.js): the backend tells
 * clients where static assets live (`ASSETS_URL`, a public GCS prefix) instead of
 * each client guessing. Uploaded media (avatars, learning materials) already
 * arrives as absolute GCS URLs and does not need this base.
 */

import { api } from './api';

export type AppConfig = {
  assets_url: string;
  app_name: string;
  google_client_id: string;
};

const FALLBACK: AppConfig = {
  assets_url: '',
  app_name: 'SmartCare',
  google_client_id: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
};

let cached: AppConfig | null = null;
let inFlight: Promise<AppConfig> | null = null;

/** Fetches once per app session; never throws, so a cold backend cannot block boot. */
export async function loadAppConfig(): Promise<AppConfig> {
  if (cached) return cached;
  if (inFlight) return inFlight;

  inFlight = api<Partial<AppConfig>>('/app-config')
    .then((data) => {
      cached = {
        assets_url: String(data?.assets_url || '').replace(/\/+$/, ''),
        app_name: data?.app_name || FALLBACK.app_name,
        google_client_id: data?.google_client_id || FALLBACK.google_client_id,
      };
      return cached;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

export function getAppConfig(): AppConfig {
  return cached || FALLBACK;
}

export function getAssetsBase(): string {
  return getAppConfig().assets_url;
}

/**
 * Resolves a bundled-style asset path (for example `assets/logo.png`) against the
 * GCS assets prefix. Matches SC.assetUrl on the web: paths are stored relative to
 * an `assets/` root, and the remote prefix already ends at that root.
 */
export function assetUrl(path?: string | null): string | null {
  const raw = String(path || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;

  const base = getAssetsBase();
  if (!base) return null;

  const cleaned = raw.replace(/^\.\.\//, '').replace(/^\.\//, '').replace(/^\//, '');
  const under = cleaned.replace(/^assets\//, '');
  return `${base}/${under}`;
}
