import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISprintServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSprint, type SprintServiceFactoryConfig, type SprintServiceFactoryOverrides } from './ServiceSprintBuilder.js'
import { SprintServiceError } from '../errors/SprintServiceError.js'

export const ServiceFactorySprint = {
  create({ config, overrides = {} }: { config: SprintServiceFactoryConfig; overrides?: SprintServiceFactoryOverrides }): Effect.Effect<ISprintServicePort, SprintServiceError> {
    config.logger?.child({ module: 'ServiceFactorySprint', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSprint.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSprint.create()
  },
}
