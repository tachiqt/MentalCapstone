import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import { focusManager, useQueryClient } from '@tanstack/react-query';
import { usePathname } from 'expo-router';

const REFRESH_INTERVAL_MS = 45_000;

/**
 * Wire React Query's focus manager for React Native so returning to the app
 * refetches stale queries without a cold restart.
 */
export function setupReactQueryNativeLifecycle() {
  focusManager.setEventListener((handleFocus) => {
    if (Platform.OS === 'web') return undefined;

    const onChange = (status: AppStateStatus) => {
      handleFocus(status === 'active');
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  });
}

/**
 * Keeps active screens fresh: refetch when the route changes, when the app
 * returns to the foreground, and on a short idle interval while visible.
 */
export function useAutoRefreshQueries() {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const previousPath = useRef(pathname);

  useEffect(() => {
    if (previousPath.current !== pathname) {
      previousPath.current = pathname;
      queryClient.invalidateQueries({ refetchType: 'active' });
    }
  }, [pathname, queryClient]);

  useEffect(() => {
    const onChange = (status: AppStateStatus) => {
      if (status === 'active') {
        queryClient.invalidateQueries({ refetchType: 'active' });
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [queryClient]);

  useEffect(() => {
    const id = setInterval(() => {
      if (AppState.currentState !== 'active') return;
      queryClient.invalidateQueries({ refetchType: 'active' });
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [queryClient]);
}
