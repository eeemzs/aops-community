import { Ibm } from '@aopslab/xf-bm';

/**
 * Interface for the Rate Limiter business model
 */
export interface IbmRateLimiter extends Ibm {
  /** The key being rate-limited (IP address or email) */
  key: string;

  /** The scope of the rate limit (e.g., 'login', 'register') */
  scope: string;

  /** Number of attempts made */
  attempts: number;

  /** When the rate limit window started */
  windowStart?: Date | null;

  /** When the rate limit will reset */
  resetAt?: Date | null;

  /** When the block was created (if applicable) */
  blockedAt?: Date | null;

  /** Consecutive block streak used for escalating block durations */
  violationStreak?: number | null;

  /** When the latest fresh violation/block was created */
  lastViolationAt?: Date | null;
}

// Used @ toDomain conversion to filter out the keys that are not in the domain model
// Optional to use.
export const IbmRateLimiterKeys = [
  'id',
  'key',
  'scope',
  'attempts',
  'windowStart',
  'resetAt',
  'blockedAt',
  'violationStreak',
  'lastViolationAt'
] as const satisfies readonly (keyof IbmRateLimiter)[];

export type IbmRateLimiterKeysType = (typeof IbmRateLimiterKeys)[number];
