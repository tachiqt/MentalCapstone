import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Short enough that returning to a tab or the app picks up server changes
      // without forcing a full relaunch.
      staleTime: 30_000,
      gcTime: 1000 * 60 * 10,
      retry: 2,
      refetchOnMount: true,
      refetchOnReconnect: true,
      refetchOnWindowFocus: true,
    },
  },
});
