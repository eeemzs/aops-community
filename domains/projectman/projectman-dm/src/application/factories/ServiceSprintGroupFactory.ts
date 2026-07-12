import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISprintGroupServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSprintGroup, type SprintGroupServiceFactoryConfig, type SprintGroupServiceFactoryOverrides } from './ServiceSprintGroupBuilder.js'
import { SprintGroupServiceError } from '../errors/SprintGroupServiceError.js'

export const ServiceFactorySprintGroup = {
  create({ config, overrides = {} }: { config: SprintGroupServiceFactoryConfig; overrides?: SprintGroupServiceFactoryOverrides }): Effect.Effect<ISprintGroupServicePort, SprintGroupServiceError> {
    config.logger?.child({ module: 'ServiceFactorySprintGroup', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSprintGroup.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSprintGroup.create()
  },
}
