/**
 * Outbound Port for Rate Limiting Operations
 *
 * Responsibilities:
 * - Provides rate limiting capabilities to other domains
 * - Abstracts away rate limiting storage implementation (Redis, Database, etc.)
 * - Used by other services to enforce rate limiting policies
 *
 * Location: application/ports/outbound/
 * Hexagonal Architecture: This is an Outbound Port
 */

import { Effect } from 'effect'
import { RateLimiterResult, RateLimitRule } from '../types.js';
import type { RateLimiterServiceError } from '../../errors/RateLimiterServiceError.js'

export interface IPortRateLimiter {
  /**
   * Check if a key is currently rate limited
   * @param key The key to check (usually IP, user ID, etc.)
   * @param scope The scope/type of rate limiting (login, register, api, etc.)
   */
  checkRateLimiter(key: string, scope: string): Effect.Effect<RateLimiterResult, RateLimiterServiceError>;

  /**
   * Record a new attempt and update rate limiting state
   * @param key The key to record attempt for
   * @param scope The scope/type of rate limiting
   * @param rule Rate limiting configuration (optional)
   */
  newAttempt(key: string, scope: string, rule?: RateLimitRule): Effect.Effect<RateLimiterResult, RateLimiterServiceError>;

  /**
   * Clean/reset rate limiting for a specific key and scope
   * @param key The key to clean
   * @param scope The scope to clean
   */
  cleanRateLimiter(key: string, scope: string): Effect.Effect<number, RateLimiterServiceError>;

  /**
   * Clean up all expired rate limiting entries
   * @returns Number of entries cleaned up
   */
  cleanupAll(): Effect.Effect<number, RateLimiterServiceError>;
}
