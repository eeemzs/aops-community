/**
 * RateLimiterService - Rate Limiting Use-case Orchestrator
 *
 * Responsibilities:
 * 1. Orchestrates rate limiting use-cases
 * 2. Enforces business rules and policies for rate limiting
 * 3. Coordinates outbound ports for rate limiting storage
 * 4. Handles cross-cutting concerns (logging, validation, error handling)
 * 5. Implements the IRateLimiterServiceApiPort contract (inbound API port)
 *
 * Location: application/services/
 * Hexagonal Architecture: This is a Service (Use-case orchestrator)
 *
 * Notes:
 * - This service can be used by other domains for rate limiting
 * - Contains business logic for rate limiting policies
 * - Provides a clean API for rate limiting operations
 */

// External dependencies
import { Effect } from 'effect'
import { z } from 'zod'
import { getParent, XfLogger } from '@aopslab/xf-logger';
import { LocaleOptions } from '@aopslab/xf-dm';
import {
  RateLimiterDomainError,
  RateLimiterErrorCode,
  RateLimiterErrorFactory,
  type RateLimiterServiceError
} from '../../errors/RateLimiterServiceError.js';
import { effectErrorInfo } from '@aopslab/xf-core'
import { validateBmInputWithSchema } from '../service.zod-validation.js'

// Application layer imports
import { IRateLimiterServicePort } from '../../ports/inbound/IRateLimiterServicePort.js';
import { IPortRateLimiter } from '../../ports/outbound/IPortRateLimiter.js';
import { RateLimiterResult, RateLimitRule } from '../../ports/types.js';

const rateLimiterArgsSchema = z.object({
  key: z.string().trim().min(1),
  scope: z.string().trim().min(1),
});

export class RateLimiterService implements IRateLimiterServicePort {
  private readonly rateLimiterPort: IPortRateLimiter;
  private readonly logger?: XfLogger;
  private readonly locale: string;
  private readonly fallbackLocale: string;

  constructor(rateLimiterPort: IPortRateLimiter, options: LocaleOptions, logger?: XfLogger) {
    this.rateLimiterPort = rateLimiterPort;
    this.locale = options.locale ?? 'en';
    this.fallbackLocale = options.fallbackLocale ?? 'en';
    this.logger = logger?.child({
      module: this.constructor.name,
      parent: getParent(logger)
    });

    this.logger?.debug(
      {
        locale: this.locale,
        fallbackLocale: this.fallbackLocale
      },
      'RateLimiterService initialized'
    );
  }

  private mapRateLimiterPortError(params: {
    stage: string;
    operation: string;
    code: RateLimiterErrorCode;
    key?: string;
    scope?: string;
  }): (cause: unknown) => RateLimiterServiceError {
    return (cause) => {
      if (cause instanceof RateLimiterDomainError) {
        return cause;
      }

      return RateLimiterErrorFactory.rateLimiterDomainError({
        code: params.code,
        stage: params.stage,
        operation: params.operation,
        message: `Rate limiter operation failed: ${params.operation}`,
        key: params.key,
        scope: params.scope,
        cause,
      });
    };
  }

  /**
   * Use-case: Check rate limiting status
   */
  checkRateLimit(key: string, scope: string): Effect.Effect<RateLimiterResult, RateLimiterServiceError> {
    const self = this
    const stage = `${self.constructor.name}::checkRateLimit`
    return Effect.gen(function* (_) {
      self.logger?.debug({ key, scope }, 'checkRateLimit use-case started')
      const validatedArgs = yield* _(
        validateBmInputWithSchema({
          input: { key, scope },
          schema: rateLimiterArgsSchema,
          stage,
          operation: 'checkRateLimit',
          field: 'rateLimiterArgs',
        })
      )
      const result = yield* _(
        self.rateLimiterPort
          .checkRateLimiter(validatedArgs.key, validatedArgs.scope)
          .pipe(
            Effect.mapError(
              self.mapRateLimiterPortError({
                stage,
                operation: 'rateLimiterPort.checkRateLimiter',
                code: RateLimiterErrorCode.CheckFailed,
                key: validatedArgs.key,
                scope: validatedArgs.scope,
              })
            )
          )
      )
      self.logger?.debug({ key: validatedArgs.key, scope: validatedArgs.scope, result }, 'checkRateLimit completed')
      return result
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'checkRateLimit failed')
        })
      )
    )
  }

  /**
   * Use-case: Record an attempt and update rate limiting
   */
  recordAttempt(key: string, scope: string, rule?: RateLimitRule): Effect.Effect<RateLimiterResult, RateLimiterServiceError> {
    const self = this
    const stage = `${self.constructor.name}::recordAttempt`
    return Effect.gen(function* (_) {
      self.logger?.debug({ key, scope, rule }, 'recordAttempt use-case started')
      const validatedArgs = yield* _(
        validateBmInputWithSchema({
          input: { key, scope },
          schema: rateLimiterArgsSchema,
          stage,
          operation: 'recordAttempt',
          field: 'rateLimiterArgs',
        })
      )
      const result = yield* _(
        self.rateLimiterPort
          .newAttempt(validatedArgs.key, validatedArgs.scope, rule)
          .pipe(
            Effect.mapError(
              self.mapRateLimiterPortError({
                stage,
                operation: 'rateLimiterPort.newAttempt',
                code: RateLimiterErrorCode.AttemptFailed,
                key: validatedArgs.key,
                scope: validatedArgs.scope,
              })
            )
          )
      )
      self.logger?.debug({ key: validatedArgs.key, scope: validatedArgs.scope, result }, 'recordAttempt completed')
      return result
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'recordAttempt failed')
        })
      )
    )
  }

  /**
   * Use-case: Reset rate limiting for a key/scope
   */
  resetRateLimit(key: string, scope: string): Effect.Effect<number, RateLimiterServiceError> {
    const self = this
    const stage = `${self.constructor.name}::resetRateLimit`
    return Effect.gen(function* (_) {
      self.logger?.debug({ key, scope }, 'resetRateLimit use-case started')
      const validatedArgs = yield* _(
        validateBmInputWithSchema({
          input: { key, scope },
          schema: rateLimiterArgsSchema,
          stage,
          operation: 'resetRateLimit',
          field: 'rateLimiterArgs',
        })
      )
      const result = yield* _(
        self.rateLimiterPort
          .cleanRateLimiter(validatedArgs.key, validatedArgs.scope)
          .pipe(
            Effect.mapError(
              self.mapRateLimiterPortError({
                stage,
                operation: 'rateLimiterPort.cleanRateLimiter',
                code: RateLimiterErrorCode.ResetFailed,
                key: validatedArgs.key,
                scope: validatedArgs.scope,
              })
            )
          )
      )
      self.logger?.debug({ key: validatedArgs.key, scope: validatedArgs.scope, result }, 'resetRateLimit completed')
      return result
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'resetRateLimit failed')
        })
      )
    )
  }

  /**
   * Use-case: Cleanup expired entries
   */
  cleanupExpiredEntries(): Effect.Effect<number, RateLimiterServiceError> {
    const self = this
    const stage = `${self.constructor.name}::cleanupExpiredEntries`
    return Effect.gen(function* (_) {
      self.logger?.debug('cleanupExpiredEntries use-case started')
      const result = yield* _(
        self.rateLimiterPort
          .cleanupAll()
          .pipe(
            Effect.mapError(
              self.mapRateLimiterPortError({
                stage,
                operation: 'rateLimiterPort.cleanupAll',
                code: RateLimiterErrorCode.CleanupFailed,
              })
            )
          )
      )
      self.logger?.debug({ result }, 'cleanupExpiredEntries completed')
      return result
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'cleanupExpiredEntries failed')
        })
      )
    )
  }

  /**
   * Use-case: Get rate limiting statistics
   * Note: This would require additional repository methods to implement fully
   */
  getRateLimitStats(scope?: string): Effect.Effect<{ totalEntries: number; blockedEntries: number; activeScopes: string[] }, RateLimiterServiceError> {
    const self = this
    const stage = `${self.constructor.name}::getRateLimitStats`
    return Effect.gen(function* (_) {
      self.logger?.debug({ scope }, 'getRateLimitStats use-case started')
      self.logger?.warn('getRateLimitStats not fully implemented yet')
      return { totalEntries: 0, blockedEntries: 0, activeScopes: scope ? [scope] : [] }
    }).pipe(
      Effect.tapError((e) =>
        Effect.sync(() => {
          const info = effectErrorInfo(e)
          self.logger?.error({ error: info.unwrapped, cause: info.pretty, stage }, 'getRateLimitStats failed')
        })
      )
    )
  }
}
