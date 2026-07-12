import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IKanbanTaskServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderKanbanTask, type KanbanTaskServiceFactoryConfig, type KanbanTaskServiceFactoryOverrides } from './ServiceKanbanTaskBuilder.js'
import { KanbanTaskServiceError } from '../errors/KanbanTaskServiceError.js'

export const ServiceFactoryKanbanTask = {
  create({ config, overrides = {} }: { config: KanbanTaskServiceFactoryConfig; overrides?: KanbanTaskServiceFactoryOverrides }): Effect.Effect<IKanbanTaskServicePort, KanbanTaskServiceError> {
    config.logger?.child({ module: 'ServiceFactoryKanbanTask', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderKanbanTask.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderKanbanTask.create()
  },
}
