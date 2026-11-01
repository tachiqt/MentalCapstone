import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, StyleProp, View, StyleSheet } from 'react-native';
import { apiUrl, getToken } from '../lib/api';
import { colors, radii } from '../lib/theme';

type Props = {
  path: string;
  style?: StyleProp<ImageStyle>;
};

async function toDataUri(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Could not read image'));
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  }

  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  const mime = blob.type || 'image/jpeg';
  return `data:${mime};base64,${btoa(binary)}`;
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
