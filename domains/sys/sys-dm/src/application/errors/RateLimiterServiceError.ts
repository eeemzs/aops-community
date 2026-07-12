import { XfError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'
import { ErrorDomainSys } from '../../domain/domain.js'

/**
 * RateLimiter Domain Hata Modeli — Kısa Rehber
 * - Tek Tag: Domain hataları tek tag altında gruplanır.
 * - Enum Code: İnce ayrımlar enum `code` ile ifade edilir.
 * - Validation: XfError (validation) pass-through.
 * - RepositoryError: adapter/port tarafında üretilebilir; gerekirse service içinde mapDbError ile domain'e çevrilir.
 */
export enum RateLimiterErrorCode {
  InvalidInput = 'InvalidInput',
  CheckFailed = 'CheckFailed',
  AttemptFailed = 'AttemptFailed',
  ResetFailed = 'ResetFailed',
  CleanupFailed = 'CleanupFailed',
}

export const RateLimiterErrorTag = {
  Domain: `${ErrorDomainSys.RateLimiter}`,
} as const

export class RateLimiterDomainError extends Data.TaggedError(RateLimiterErrorTag.Domain)<WithBaseErrorFields<{ key?: string; scope?: string }>> {}

export type RateLimiterServiceError = RateLimiterDomainError | XfError | RepositoryError

export const RateLimiterErrorFactory = {
  rateLimiterDomainError: (params: WithBaseErrorFields<{ key?: string; scope?: string }>): RateLimiterDomainError => new RateLimiterDomainError(params),
}
