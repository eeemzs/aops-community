import { Effect } from 'effect'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import type { ICountryServicePort } from '../ports/inbound/ICountryServicePort.js'
import { CountryErrorCode, CountryErrorFactory, type CountryServiceError } from '../errors/CountryServiceError.js'
import { getCountryCatalogByIso2Code, listCountryCatalog, type CountryCatalogQuery, type IbmCountry } from '../../domain/models/index.js'

export interface CountryServiceOptions {
  logger?: XfLogger
  locale?: string
  fallbackLocale?: string
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function buildInvalidInputError(message: string, iso2Code?: string): CountryServiceError {
  return CountryErrorFactory.countryDomainError({
    code: CountryErrorCode.InvalidInput,
    message,
    stage: 'CountryService',
    ...(iso2Code ? { iso2Code } : {}),
  })
}

export class CountryService implements ICountryServicePort {
  private readonly logger?: XfLogger

  constructor(options: CountryServiceOptions = {}) {
    this.logger = options.logger?.child({ module: this.constructor.name, parent: getParent(options.logger) })
  }

  listCountries(input?: CountryCatalogQuery): Effect.Effect<IbmCountry[], CountryServiceError> {
    return Effect.try({
      try: () => listCountryCatalog(input),
      catch: (error) =>
        CountryErrorFactory.countryDomainError({
          code: CountryErrorCode.ListFailed,
          message: error instanceof Error ? error.message : 'Country list failed',
          stage: 'CountryService::listCountries',
          cause: error,
        }),
    }).pipe(
      Effect.tap((entries) =>
        Effect.sync(() => this.logger?.debug({ count: entries.length }, 'Listed countries from catalog')),
      ),
    )
  }

  getCountryByIso2Code(iso2Code: string): Effect.Effect<IbmCountry | null, CountryServiceError> {
    const normalizedCode = normalizeText(iso2Code).toUpperCase()
    if (!normalizedCode) {
      return Effect.fail(buildInvalidInputError('iso2Code is required'))
    }

    return Effect.try({
      try: () => getCountryCatalogByIso2Code(normalizedCode),
      catch: (error) =>
        CountryErrorFactory.countryDomainError({
          code: CountryErrorCode.LookupFailed,
          message: error instanceof Error ? error.message : 'Country lookup failed',
          stage: 'CountryService::getCountryByIso2Code',
          iso2Code: normalizedCode,
          cause: error,
        }),
    }).pipe(
      Effect.tap((entry) =>
        Effect.sync(() => this.logger?.debug({ iso2Code: normalizedCode, found: Boolean(entry) }, 'Resolved country by ISO2')),
      ),
    )
  }
}
