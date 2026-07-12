import { Effect } from 'effect'
import type { ICounterServicePort } from '../ports/inbound/ICounterServicePort.js'
import {
  ServiceBuilderCounter,
  type CounterServiceFactoryConfig,
  type CounterServiceFactoryOverrides,
} from './ServiceCounterBuilder.js'

export const ServiceFactoryCounter = {
  create(
    config: CounterServiceFactoryConfig,
    overrides: Partial<CounterServiceFactoryOverrides> = {},
  ): Effect.Effect<ICounterServicePort, Error> {
    const builder = ServiceBuilderCounter.create().withConfig(config)
    if (overrides.repository) builder.withRepository(overrides.repository)
    return builder.build()
  },

  builder(): ServiceBuilderCounter {
    return ServiceBuilderCounter.create()
  },
}
