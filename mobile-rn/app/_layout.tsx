import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { Slot } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import {
  Figtree_500Medium,
  Figtree_600SemiBold,
  Figtree_700Bold,
} from '@expo-google-fonts/figtree';
import {
  NotoSans_400Regular,
  NotoSans_500Medium,
  NotoSans_600SemiBold,
} from '@expo-google-fonts/noto-sans';
import { AuthProvider } from '../lib/auth';
import { queryClient } from '../lib/query-client';
import { loadAppConfig } from '../lib/app-config';
import { colors } from '../lib/theme';
import { StatusBar } from 'expo-status-bar';
import { KeyboardProvider } from 'react-native-keyboard-controller';

// Hold the native splash until the faces are in memory. Without this the first
// frame paints in the platform sans and every heading visibly reflows.
SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
    NotoSans_400Regular,
    NotoSans_500Medium,
    NotoSans_600SemiBold,
  });

  // Same as the web dashboard's boot step: learn where Cloud Storage assets live.
  useEffect(() => {
    loadAppConfig();
  }, []);

  const onReady = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  // A font that failed to download is worse than a fallback face, so render
  // anyway rather than trapping the user on the splash screen.
  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <KeyboardProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <StatusBar style="dark" />
            <View style={{ flex: 1, backgroundColor: colors.background }} onLayout={onReady}>
              <Slot />
            </View>
          </AuthProvider>
        </QueryClientProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}
