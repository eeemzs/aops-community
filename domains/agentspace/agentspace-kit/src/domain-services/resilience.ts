import type { AgentspaceKitProviderOptions } from './types.js';

/**
 * Resilience/policy preset'lerini tek yerde toplayın.
 * Örn. retry/breaker/timeouts veya cache ayarları.
 */
export const defaultAgentspaceKitResilience: Pick<AgentspaceKitProviderOptions, 'resilience' | 'cache'> = {
  resilience: {
    services: {
      // retry: { maxRetries: 3, delayMs: 50 },
      // timeoutMs: 5_000,
    },
    repositories: {
      // retry: { maxRetries: 2, delayMs: 25 },
      // timeoutMs: 3_000,
    },
  },
  cache: {
    // ttlMs: 5 * 60 * 1000,
  },
};
