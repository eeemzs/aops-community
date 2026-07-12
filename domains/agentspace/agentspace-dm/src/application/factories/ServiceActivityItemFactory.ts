import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IActivityItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderActivityItem, type ActivityItemServiceFactoryConfig, type ActivityItemServiceFactoryOverrides } from './ServiceActivityItemBuilder.js'
import { ActivityItemServiceError } from '../errors/ActivityItemServiceError.js'

export const ServiceFactoryActivityItem = {
  create({ config, overrides = {} }: { config: ActivityItemServiceFactoryConfig; overrides?: ActivityItemServiceFactoryOverrides }): Effect.Effect<IActivityItemServicePort, ActivityItemServiceError> {
    config.logger?.child({ module: 'ServiceFactoryActivityItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderActivityItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderActivityItem.create()
  },
}
