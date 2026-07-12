/**
 * Shared Types for Rate Limiter Ports
 *
 * These types are used by both inbound and outbound ports
 * and represent the contracts between application and infrastructure layers.
 *
 * Location: application/ports/
 */

import { IbmRateLimiter } from '../../domain/models/index.js';

/**
 * Result returned by rate limiting operations
 */
export interface RateLimiterResult {
  isBlocked: boolean;
  rateLimiter?: IbmRateLimiter;
}

/**
 * Configuration options for rate limiting operations
 */
export interface RateLimitRule {
  maxAttempts: number;
  blockDurationInSeconds: number;
  backoffMultiplier?: number;
  maxBlockDurationInSeconds?: number;
  overrideRedisDefaultTtl?: number;
  //   customMessage?: string
}
