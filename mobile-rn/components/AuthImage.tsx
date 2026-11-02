import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, StyleProp, View, StyleSheet } from 'react-native';
import { apiUrl, getToken } from '../lib/api';
import { colors, radii } from '../lib/theme';

type Props = {
  path: string;
  style?: StyleProp<ImageStyle>;
};

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = bytes[i + 1] ?? 0;
    const c = bytes[i + 2] ?? 0;
    const triplet = (a << 16) | (b << 8) | c;
    const pad = i + 1 >= bytes.length ? 2 : i + 2 >= bytes.length ? 1 : 0;
    out += BASE64_ALPHABET[(triplet >> 18) & 63];
    out += BASE64_ALPHABET[(triplet >> 12) & 63];
    out += pad === 2 ? '=' : BASE64_ALPHABET[(triplet >> 6) & 63];
    out += pad > 0 ? '=' : BASE64_ALPHABET[triplet & 63];
  }
  return out;
}

async function toDataUri(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    try {
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Could not read image'));
        reader.onloadend = () => resolve(String(reader.result || ''));
        reader.readAsDataURL(blob);
      });
    } catch {
      // Fall through to manual base64.
    }
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

/**
 * Loads a private API file (Bearer) into a data URI for Image display.
 */
export function AuthImage({ path, style }: Props) {
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const token = await getToken();
        const res = await fetch(apiUrl(path), {
          headers: {
            Accept: '*/*',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        const dataUrl = await toDataUri(blob);
        if (!cancelled) setUri(dataUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [path]);

  if (failed) {
    return <View style={[styles.fallback, style as object]} />;
  }

  if (!uri) {
    return (
      <View style={[styles.fallback, style as object]}>
        <ActivityIndicator color={colors.primary} size="small" />
      </View>
    );
  }

  return <Image source={{ uri }} style={style} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  fallback: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
