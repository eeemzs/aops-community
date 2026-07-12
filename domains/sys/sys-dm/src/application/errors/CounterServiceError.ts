import { XfError, WithBaseErrorFields } from '@aopslab/xf-core'
import { RepositoryError } from '@aopslab/xf-db'
import { Data } from 'effect'
import { ErrorDomainSys } from '../../domain/domain.js'

export enum CounterErrorCode {
  InvalidInput = 'InvalidInput',
  ReadFailed = 'ReadFailed',
  AllocateFailed = 'AllocateFailed',
  ResetFailed = 'ResetFailed',
}

export const CounterErrorTag = {
  Domain: `${ErrorDomainSys.Counter}`,
} as const

export class CounterDomainError extends Data.TaggedError(CounterErrorTag.Domain)<
  WithBaseErrorFields<{ counterKey?: string; scopeId?: string }>
> {}

export type CounterServiceError = CounterDomainError | XfError | RepositoryError

export const CounterErrorFactory = {
  counterDomainError: (params: WithBaseErrorFields<{ counterKey?: string; scopeId?: string }>): CounterDomainError =>
    new CounterDomainError(params),
}
