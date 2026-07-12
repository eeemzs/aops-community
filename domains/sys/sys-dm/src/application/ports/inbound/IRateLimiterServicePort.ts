/**
 * Inbound API Port for Rate Limiter Service
 *
 * Responsibilities:
 * - Defines the contract for rate limiting use-cases as a service
 * - Exposes rate limiting operations to other domains
 * - Used by other domains to access rate limiting functionality
 * - Represents the sys domain's rate limiting API
 *
 * Location: application/ports/inbound/
 * Hexagonal Architecture: This is an Inbound API Port
 *
 * Usage:
 * - Other domains use this to access rate limiting services
 * - HTTP adapters can also use this for direct rate limiting endpoints
 * - Background jobs can use this for rate limit management
 */

import { Effect } from 'effect'
import { RateLimiterResult, RateLimitRule } from '../types.js';
import type { RateLimiterServiceError } from '../../errors/RateLimiterServiceError.js'

export interface IRateLimiterServicePort {
  /**
   * Check if a key is currently rate limited
   * @param key The key to check (usually IP, user ID, etc.)
   * @param scope The scope/type of rate limiting (login, register, api, etc.)
   */
  checkRateLimit(key: string, scope: string): Effect.Effect<RateLimiterResult, RateLimiterServiceError>;

  /**
   * Record a new attempt and update rate limiting state
   * @param key The key to record attempt for
   * @param scope The scope/type of rate limiting
   * @param rule Rate limiting configuration (optional)
   */
  recordAttempt(key: string, scope: string, rule?: RateLimitRule): Effect.Effect<RateLimiterResult, RateLimiterServiceError>;

  /**
   * Clean/reset rate limiting for a specific key and scope
   * @param key The key to clean
   * @param scope The scope to clean
   */
  resetRateLimit(key: string, scope: string): Effect.Effect<number, RateLimiterServiceError>;

  /**
   * Clean up all expired rate limiting entries
   * @returns Number of entries cleaned up
   */
  cleanupExpiredEntries(): Effect.Effect<number, RateLimiterServiceError>;

  /**
   * Get rate limiting statistics for monitoring
   * @param scope Optional scope to filter by
   */
  getRateLimitStats(scope?: string): Effect.Effect<{
    totalEntries: number;
    blockedEntries: number;
    activeScopes: string[];
  }, RateLimiterServiceError>;
}
