import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ICountryServicePort } from '../ports/inbound/ICountryServicePort.js'
import { ServiceBuilderCountry, type CountryServiceFactoryConfig } from './ServiceCountryBuilder.js'
import type { CountryServiceError } from '../errors/CountryServiceError.js'

export const ServiceFactoryCountry = {
  create(config: CountryServiceFactoryConfig = {}): Effect.Effect<ICountryServicePort, CountryServiceError> {
    config.logger?.child(
      { module: 'ServiceFactoryCountry', parent: getParent(config.logger) },
      { level: config.logLevel ?? 'info' },
    )
    return ServiceBuilderCountry.create().withConfig(config).withLogLevel(config.logLevel).build()
  },

  builder() {
    return ServiceBuilderCountry.create()
  },
}
