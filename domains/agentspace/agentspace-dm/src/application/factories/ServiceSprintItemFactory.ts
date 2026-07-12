import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISprintItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSprintItem, type SprintItemServiceFactoryConfig, type SprintItemServiceFactoryOverrides } from './ServiceSprintItemBuilder.js'
import { SprintItemServiceError } from '../errors/SprintItemServiceError.js'

export const ServiceFactorySprintItem = {
  create({ config, overrides = {} }: { config: SprintItemServiceFactoryConfig; overrides?: SprintItemServiceFactoryOverrides }): Effect.Effect<ISprintItemServicePort, SprintItemServiceError> {
    config.logger?.child({ module: 'ServiceFactorySprintItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSprintItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSprintItem.create()
  },
}
