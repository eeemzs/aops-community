// External dependencies
import { XfResultLegacy as XfResult } from '@aopslab/xf-core';
import { XfLogger } from '@aopslab/xf-logger';
import { Effect, Data } from 'effect'

// Domain imports
import { IbmRateLimiter } from '../../../domain/models/index.js';

// Application layer imports
import { RateLimiterResult, RateLimitRule } from '../../../application/ports/types.js';

export type RateLimitFindSingleAdapter<T> = (key: string, scope: string) => Promise<XfResult<T>>;

export type RateLimitCreateAdapter<T> = (dm: T) => Promise<XfResult<T>>;
export type RateLimitUpdateByIdAdapter<T> = (id: string, dm: T) => Promise<XfResult<T>>;
export type RateLimitDeleteByIdAdapter = (id: string) => Promise<XfResult<number>>;
export type RateLimitDeleteManyAdapter = (criteria: any) => Promise<XfResult<number>>;

type NormalizedRateLimitRule = {
  maxAttempts: number;
  blockDurationInSeconds: number;
  backoffMultiplier: number;
  maxBlockDurationInSeconds: number;
};

export const RateLimiterCommonErrorTag = {
  Domain: 'RateLimiterCommonError',
} as const

export class RateLimiterCommonError extends Data.TaggedError(RateLimiterCommonErrorTag.Domain)<{
  message: string
  stage: string
  debug?: any
}> {}

function normalizePositiveInteger(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : fallback;
}

function normalizePositiveNumber(value: number | undefined, fallback: number): number {
  if (typeof value !== 'number') return fallback;
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function normalizeRateLimitRule(rule: RateLimitRule): NormalizedRateLimitRule {
  const blockDurationInSeconds = normalizePositiveInteger(rule.blockDurationInSeconds, 1);
  return {
    maxAttempts: normalizePositiveInteger(rule.maxAttempts, 1),
    blockDurationInSeconds,
    backoffMultiplier: Math.max(1, normalizePositiveNumber(rule.backoffMultiplier, 1)),
    maxBlockDurationInSeconds: normalizePositiveInteger(rule.maxBlockDurationInSeconds, blockDurationInSeconds),
  };
}

function normalizeStoredStreak(value: number | null | undefined): number {
  if (typeof value !== 'number') return 0;
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : 0;
}

function calculateBlockDurationInSeconds(rule: NormalizedRateLimitRule, violationStreak: number): number {
  if (rule.backoffMultiplier <= 1) {
    return rule.blockDurationInSeconds;
  }

  const exponent = Math.max(0, violationStreak - 1);
  const escalated = Math.ceil(rule.blockDurationInSeconds * Math.pow(rule.backoffMultiplier, exponent));
  return Math.min(escalated, rule.maxBlockDurationInSeconds);
}

export function rateLimiterCommonNewAttempt(
  findSingleAdapter: RateLimitFindSingleAdapter<IbmRateLimiter>,
  createAdapter: RateLimitCreateAdapter<IbmRateLimiter>,
  updateByIdAdapter: RateLimitUpdateByIdAdapter<IbmRateLimiter>,
  _deleteByIdAdapter: RateLimitDeleteByIdAdapter,
  key: string,
  scope: string,
  rule: RateLimitRule,
  logger?: XfLogger
): Effect.Effect<RateLimiterResult, RateLimiterCommonError> {
  const self = { logger };
  return Effect.gen(function* (_) {
    if (!key || !scope || scope.length < 2 || key.length < 2) {
      return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Key and scope are required', stage: 'rateLimiterCommonNewAttempt:keyAndTypeRequired' })));
    }

    const dbRes: XfResult<IbmRateLimiter> = yield* _(Effect.tryPromise({
      try: () => findSingleAdapter(key, scope) as Promise<XfResult<IbmRateLimiter>>,
      catch: (e) => new RateLimiterCommonError({ message: 'findSingleAdapter failed', stage: 'rateLimiterCommonNewAttempt:findSingle', debug: { key, scope, cause: e } })
    }));

    const effectiveRule = normalizeRateLimitRule(rule);
    const now = new Date();

    if (!dbRes.ok || dbRes.data === undefined) {
      const createRes: XfResult<IbmRateLimiter> = yield* _(Effect.tryPromise({
        try: () => {
          const windowStart = new Date();
          return createAdapter({
            key,
            scope,
            attempts: 1,
            windowStart,
            resetAt: new Date(windowStart.getTime() + effectiveRule.blockDurationInSeconds * 1000),
            blockedAt: null,
            violationStreak: 0,
            lastViolationAt: null
          }) as Promise<XfResult<IbmRateLimiter>>;
        },
        catch: (e) => new RateLimiterCommonError({ message: 'createAdapter failed', stage: 'rateLimiterCommonNewAttempt:create', debug: { key, scope, cause: e } })
      }));
      if (!createRes.ok) {
        return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Failed to create rate limiter', stage: 'rateLimiterCommonNewAttempt:createFailed', debug: { key, scope, createRes } })));
      }
      return { isBlocked: false, rateLimiter: createRes.data } as RateLimiterResult;
    }

    const rateLimiter = dbRes.data;
    const maxAttempts = effectiveRule.maxAttempts;

    if (rateLimiter.resetAt && rateLimiter.resetAt < now) {
      if (!rateLimiter.id) {
        return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Rate limiter ID is missing', stage: 'rateLimiterCommonNewAttempt:missingId' })));
      }

      const previousWindowWasBlocked = !!rateLimiter.blockedAt;
      rateLimiter.attempts = 1;
      rateLimiter.windowStart = now;
      rateLimiter.resetAt = new Date(now.getTime() + effectiveRule.blockDurationInSeconds * 1000);
      rateLimiter.blockedAt = null;
      rateLimiter.violationStreak = previousWindowWasBlocked ? normalizeStoredStreak(rateLimiter.violationStreak) : 0;
      rateLimiter.lastViolationAt = previousWindowWasBlocked ? rateLimiter.lastViolationAt ?? null : null;

      const updateResult: XfResult<IbmRateLimiter> = yield* _(Effect.tryPromise({
        try: () => updateByIdAdapter(rateLimiter.id!, rateLimiter) as Promise<XfResult<IbmRateLimiter>>,
        catch: (e) => new RateLimiterCommonError({ message: 'updateByIdAdapter failed', stage: 'rateLimiterCommonNewAttempt:resetExpiredWindow', debug: { id: rateLimiter.id, cause: e } })
      }));
      if (!updateResult.ok) {
        return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Failed to reset expired rate limiter window', stage: 'rateLimiterCommonNewAttempt:resetExpiredWindow', debug: { rateLimiter, updateResult } })));
      }
      return { isBlocked: false, rateLimiter: updateResult.data } as RateLimiterResult;
    }

    if (rateLimiter.blockedAt) {
      self.logger?.debug({ key, scope, attempts: rateLimiter.attempts, blockedAt: rateLimiter.blockedAt }, 'User is already blocked - not incrementing attempts');
      return { isBlocked: true, rateLimiter } as RateLimiterResult;
    }

    rateLimiter.attempts++;
    if (rateLimiter.attempts > maxAttempts) {
      const nextViolationStreak = normalizeStoredStreak(rateLimiter.violationStreak) + 1;
      const blockDurationInSeconds = calculateBlockDurationInSeconds(effectiveRule, nextViolationStreak);
      rateLimiter.attempts = maxAttempts;
      self.logger?.warn({ key, scope, attempts: rateLimiter.attempts, maxAttempt: maxAttempts, nextViolationStreak, blockDurationInSeconds }, 'Max attempts reached');
      rateLimiter.windowStart = now;
      rateLimiter.resetAt = new Date(now.getTime() + blockDurationInSeconds * 1000);
      rateLimiter.blockedAt = now;
      rateLimiter.violationStreak = nextViolationStreak;
      rateLimiter.lastViolationAt = now;
      if (!rateLimiter.id) {
        return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Rate limiter ID is missing for update', stage: 'rateLimiterCommonNewAttempt:missingIdForUpdate', debug: { rateLimiter } })));
      }
      const updateResult: XfResult<IbmRateLimiter> = yield* _(Effect.tryPromise({
        try: () => updateByIdAdapter(rateLimiter.id!, rateLimiter) as Promise<XfResult<IbmRateLimiter>>,
        catch: (e) => new RateLimiterCommonError({ message: 'updateByIdAdapter failed', stage: 'rateLimiterCommonNewAttempt:updateById', debug: { id: rateLimiter.id, cause: e } })
      }));
      if (!updateResult.ok) {
        return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Failed to update rate limiter', stage: 'rateLimiterCommonNewAttempt:updateByIdAdapter', debug: { rateLimiter, updateResult } })));
      }
      return { isBlocked: true, rateLimiter: updateResult.data } as RateLimiterResult;
    }

    self.logger?.debug({ key, scope, attempts: rateLimiter.attempts }, 'Rate limiter is tracking attempts but not blocked');
    if (!rateLimiter.id) {
      return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Rate limiter ID is missing for final update', stage: 'rateLimiterCommonNewAttempt:missingIdForFinalUpdate', debug: { rateLimiter } })));
    }
    const updateResult: XfResult<IbmRateLimiter> = yield* _(Effect.tryPromise({
      try: () => updateByIdAdapter(rateLimiter.id!, rateLimiter) as Promise<XfResult<IbmRateLimiter>>,
      catch: (e) => new RateLimiterCommonError({ message: 'updateByIdAdapter failed', stage: 'rateLimiterCommonNewAttempt:updateById', debug: { id: rateLimiter.id, cause: e } })
    }));
    if (!updateResult.ok) {
      return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Failed to update rate limiter', stage: 'rateLimiterCommonNewAttempt:updateByIdAdapter', debug: { rateLimiter, updateResult } })));
    }
    return { isBlocked: false, rateLimiter: updateResult.data } as RateLimiterResult;
  });
}

export function rateLimiterRepoCommonCheckRateLimiter(
  findSingleAdapter: RateLimitFindSingleAdapter<IbmRateLimiter>,
  key: string,
  scope: string
): Effect.Effect<RateLimiterResult, RateLimiterCommonError> {
  return Effect.gen(function* (_) {
    const result: XfResult<IbmRateLimiter> = yield* _(Effect.tryPromise({
      try: () => findSingleAdapter(key, scope) as Promise<XfResult<IbmRateLimiter>>,
      catch: (e) => new RateLimiterCommonError({ message: 'findSingleAdapter failed', stage: 'rateLimiterRepoCommonCheckRateLimiter', debug: { key, scope, cause: e } })
    }));
    if (!result.ok || result.data === undefined) {
      return { isBlocked: false, rateLimiter: undefined };
    }
    if (result.data?.blockedAt) {
      if (result.data.resetAt && result.data.resetAt < new Date()) {
        return { isBlocked: false, rateLimiter: result.data };
      }
      return { isBlocked: true, rateLimiter: result.data };
    }
    return { isBlocked: false, rateLimiter: result.data };
  });
}
export function rateLimiterRepoCommonCleanRateLimiter(
  deleteManyAdapter: RateLimitDeleteManyAdapter,
  key: string,
  scope: string
): Effect.Effect<number, RateLimiterCommonError> {
  return Effect.gen(function* (_) {
    if (!key || !scope || scope.length < 2 || key.length < 2) {
      return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Key and scope are required and must be at least 2 characters', stage: 'rateLimiterRepoCommonCleanRateLimiter' })));
    }
    const res: XfResult<number> = yield* _(Effect.tryPromise({
      try: () => deleteManyAdapter({ key, scope }) as Promise<XfResult<number>>,
      catch: (e) => new RateLimiterCommonError({ message: 'deleteManyAdapter failed', stage: 'rateLimiterRepoCommonCleanRateLimiter', debug: { key, scope, cause: e } })
    }));
    if (!res.ok || res.data === undefined) {
      return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Failed to delete many', stage: 'rateLimiterRepoCommonCleanRateLimiter:deleteMany', debug: { res } })));
    }
    return res.data;
  });
}

export function rateLimiterRepoCommonCleanupAll(deleteManyAdapter: RateLimitDeleteManyAdapter): Effect.Effect<number, RateLimiterCommonError> {
  return Effect.gen(function* (_) {
    const res: XfResult<number> = yield* _(Effect.tryPromise({
      try: () => deleteManyAdapter({}) as Promise<XfResult<number>>,
      catch: (e) => new RateLimiterCommonError({ message: 'deleteManyAdapter failed', stage: 'rateLimiterRepoCommonCleanupAll', debug: { cause: e } })
    }));
    if (!res.ok || res.data === undefined) {
      return yield* _(Effect.fail(new RateLimiterCommonError({ message: 'Failed to delete all', stage: 'rateLimiterRepoCommonCleanupAll:deleteMany', debug: { res } })));
    }
    return res.data;
  });
}
