import { QueryClient } from "@tanstack/react-query";

export function createAopsCockpitQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 0,
        staleTime: 10_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false
      },
      mutations: {
        retry: 0
      }
    }
  });
}

export const aopsCockpitQueryClient = createAopsCockpitQueryClient();
