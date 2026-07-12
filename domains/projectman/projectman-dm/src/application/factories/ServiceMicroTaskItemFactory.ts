import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IMicroTaskItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderMicroTaskItem, type MicroTaskItemServiceFactoryConfig, type MicroTaskItemServiceFactoryOverrides } from './ServiceMicroTaskItemBuilder.js'
import { MicroTaskItemServiceError } from '../errors/MicroTaskItemServiceError.js'

export const ServiceFactoryMicroTaskItem = {
  create({ config, overrides = {} }: { config: MicroTaskItemServiceFactoryConfig; overrides?: MicroTaskItemServiceFactoryOverrides }): Effect.Effect<IMicroTaskItemServicePort, MicroTaskItemServiceError> {
    config.logger?.child({ module: 'ServiceFactoryMicroTaskItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderMicroTaskItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderMicroTaskItem.create()
  },
}
