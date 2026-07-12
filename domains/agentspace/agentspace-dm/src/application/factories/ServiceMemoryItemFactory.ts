import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IMemoryItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderMemoryItem, type MemoryItemServiceFactoryConfig, type MemoryItemServiceFactoryOverrides } from './ServiceMemoryItemBuilder.js'
import { MemoryItemServiceError } from '../errors/MemoryItemServiceError.js'

export const ServiceFactoryMemoryItem = {
  create({ config, overrides = {} }: { config: MemoryItemServiceFactoryConfig; overrides?: MemoryItemServiceFactoryOverrides }): Effect.Effect<IMemoryItemServicePort, MemoryItemServiceError> {
    config.logger?.child({ module: 'ServiceFactoryMemoryItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderMemoryItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderMemoryItem.create()
  },
}
