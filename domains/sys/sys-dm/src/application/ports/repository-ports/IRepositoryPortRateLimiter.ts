import { RateLimiterResult, RateLimitRule } from '../types.js';
import { Effect } from 'effect'
import type { RepositoryError } from '@aopslab/xf-db'

export interface IRepositoryPortRateLimiter {
  checkRateLimiter(key: string, scope: string): Effect.Effect<RateLimiterResult, RepositoryError | Error>;

  newAttempt(key: string, scope: string, overrideRule?: RateLimitRule): Effect.Effect<RateLimiterResult, RepositoryError | Error>;

  // Remove the user's rate limiter record
  cleanRateLimiter(key: string, scope: string): Effect.Effect<number, RepositoryError | Error>;

  // Remove all rate limiters (optional on some drivers)
  cleanupAll?(): Effect.Effect<number, RepositoryError | Error>;
}
