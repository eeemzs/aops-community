// External dependencies
import { getParent, XfLogger } from '@aopslab/xf-logger';
import { Effect } from 'effect'

// Application layer imports
import { IPortRateLimiter } from '../../application/ports/outbound/IPortRateLimiter.js';
import { IRepositoryPortRateLimiter } from '../../application/ports/repository-ports/IRepositoryPortRateLimiter.js';
import { RateLimiterResult, RateLimitRule } from '../../application/ports/types.js';
import {
  RateLimiterDomainError,
  RateLimiterErrorCode,
  RateLimiterErrorFactory,
  type RateLimiterServiceError,
} from '../../application/errors/RateLimiterServiceError.js'

export interface RateLimiterAdapterParams {
  rateLimiterRepository: IRepositoryPortRateLimiter;
  defaultRules?: Record<string, RateLimitRule>; // key: scope, value: RateLimitRule
  logger?: XfLogger;
}

export class RateLimiterAdapter implements IPortRateLimiter {
  private readonly logger?: XfLogger;
  private readonly rateLimiterRepository: IRepositoryPortRateLimiter;
  private readonly defaultRules?: Record<string, RateLimitRule>;

  private mapRateLimiterRepositoryError(params: {
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
        message: `Rate limiter repository operation failed: ${params.operation}`,
        key: params.key,
        scope: params.scope,
        cause,
      });
    };
  }

  constructor({ rateLimiterRepository, defaultRules, logger }: RateLimiterAdapterParams) {
    this.rateLimiterRepository = rateLimiterRepository;
    this.defaultRules = defaultRules;
    this.logger = logger?.child({ module: this.constructor.name, parent: getParent(logger) });
    this.logger?.debug(
      {
        hasDefaultRules: !!defaultRules,
        defaultRulesCount: defaultRules ? Object.keys(defaultRules).length : 0
      },
      'RateLimiterAdapter:constructor'
    );
  }

  checkRateLimiter(key: string, scope: string): Effect.Effect<RateLimiterResult, RateLimiterServiceError> {
    const stage = `${this.constructor.name}::checkRateLimiter`;
    return this.rateLimiterRepository.checkRateLimiter(key, scope).pipe(
      Effect.mapError(
        this.mapRateLimiterRepositoryError({
          stage,
          operation: 'rateLimiterRepository.checkRateLimiter',
          code: RateLimiterErrorCode.CheckFailed,
          key,
          scope,
        })
      )
    );
  }

  newAttempt(key: string, scope: string, rule?: RateLimitRule): Effect.Effect<RateLimiterResult, RateLimiterServiceError> {
    // If no options provided, try to get default rule for the scope
    let effectiveRule = rule;

    if (!effectiveRule && this.defaultRules && this.defaultRules[scope]) {
      effectiveRule = this.defaultRules[scope];
      this.logger?.debug({ scope, rule: effectiveRule }, 'Using default rule for scope.');
    }

    if (!effectiveRule) {
      // Use conservative defaults if no rule is found
      effectiveRule = {
        maxAttempts: 5,
        blockDurationInSeconds: 300 // 5 minutes
      };
      this.logger?.warn(
        { scope, hasDefaultRules: !!this.defaultRules, effectiveRule },
        'No rate limit rule found for scope. Using effective rule.'
      );
    }

    const stage = `${this.constructor.name}::newAttempt`;
    return this.rateLimiterRepository.newAttempt(key, scope, effectiveRule).pipe(
      Effect.mapError(
        this.mapRateLimiterRepositoryError({
          stage,
          operation: 'rateLimiterRepository.newAttempt',
          code: RateLimiterErrorCode.AttemptFailed,
          key,
          scope,
        })
      )
    );
  }

  cleanRateLimiter(key: string, scope: string): Effect.Effect<number, RateLimiterServiceError> {
    const stage = `${this.constructor.name}::cleanRateLimiter`;
    return this.rateLimiterRepository.cleanRateLimiter(key, scope).pipe(
      Effect.mapError(
        this.mapRateLimiterRepositoryError({
          stage,
          operation: 'rateLimiterRepository.cleanRateLimiter',
          code: RateLimiterErrorCode.ResetFailed,
          key,
          scope,
        })
      )
    );
  }
  cleanupAll(): Effect.Effect<number, RateLimiterServiceError> {
    const anyRepo = this.rateLimiterRepository as Partial<IRepositoryPortRateLimiter>;
    if (typeof anyRepo.cleanupAll === 'function') {
      const stage = `${this.constructor.name}::cleanupAll`;
      return anyRepo.cleanupAll().pipe(
        Effect.mapError(
          this.mapRateLimiterRepositoryError({
            stage,
            operation: 'rateLimiterRepository.cleanupAll',
            code: RateLimiterErrorCode.CleanupFailed,
          })
        )
      );
    }
    return Effect.succeed(0);
  }
}
