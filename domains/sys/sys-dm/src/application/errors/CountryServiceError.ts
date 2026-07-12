import { XfError, WithBaseErrorFields } from '@aopslab/xf-core'
import { Data } from 'effect'
import { ErrorDomainSys } from '../../domain/domain.js'

export enum CountryErrorCode {
  InvalidInput = 'InvalidInput',
  LookupFailed = 'LookupFailed',
  ListFailed = 'ListFailed',
}

export const CountryErrorTag = {
  Domain: `${ErrorDomainSys.Country}`,
} as const

export class CountryDomainError extends Data.TaggedError(CountryErrorTag.Domain)<WithBaseErrorFields<{ iso2Code?: string }>> {}

export type CountryServiceError = CountryDomainError | XfError

export const CountryErrorFactory = {
  countryDomainError: (params: WithBaseErrorFields<{ iso2Code?: string }>): CountryDomainError => new CountryDomainError(params),
}
