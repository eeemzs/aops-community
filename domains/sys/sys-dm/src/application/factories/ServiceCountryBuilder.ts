import { Effect } from 'effect'
import { getParent, XfLogger } from '@aopslab/xf-logger'
import type { LocaleOptions } from '@aopslab/xf-dm'
import type { ICountryServicePort } from '../ports/inbound/ICountryServicePort.js'
import { CountryService, type CountryServiceOptions } from '../services/service.country.js'
import type { CountryServiceError } from '../errors/CountryServiceError.js'

export interface CountryServiceFactoryConfig {
  options?: LocaleOptions
  logger?: XfLogger
  logLevel?: string
}

export class ServiceBuilderCountry {
  private config?: CountryServiceFactoryConfig
  private logLevel?: string

  static create(): ServiceBuilderCountry {
    return new ServiceBuilderCountry()
  }

  withConfig(config: CountryServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withLogLevel(logLevel?: string): this {
    this.logLevel = logLevel
    return this
  }

  build(): Effect.Effect<ICountryServicePort, CountryServiceError> {
    const self = this
    return Effect.sync(() => {
      const config = self.config ?? {}
      const effectiveLogLevel = self.logLevel ?? config.logLevel ?? 'info'
      const logger = config.logger?.child(
        { module: 'ServiceBuilderCountry', parent: getParent(config.logger) },
        { level: effectiveLogLevel },
      )

      const serviceOptions: CountryServiceOptions = {
        logger,
        locale: config.options?.locale,
        fallbackLocale: config.options?.fallbackLocale,
      }

      return new CountryService(serviceOptions) as ICountryServicePort
    })
  }
}
