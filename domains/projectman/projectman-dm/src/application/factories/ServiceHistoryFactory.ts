import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IHistoryServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderHistory, type HistoryServiceFactoryConfig, type HistoryServiceFactoryOverrides } from './ServiceHistoryBuilder.js'
import { HistoryServiceError } from '../errors/HistoryServiceError.js'

export const ServiceFactoryHistory = {
  create({ config, overrides = {} }: { config: HistoryServiceFactoryConfig; overrides?: HistoryServiceFactoryOverrides }): Effect.Effect<IHistoryServicePort, HistoryServiceError> {
    config.logger?.child({ module: 'ServiceFactoryHistory', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderHistory.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderHistory.create()
  },
}
