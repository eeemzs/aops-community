import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IKanbanColumnServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderKanbanColumn, type KanbanColumnServiceFactoryConfig, type KanbanColumnServiceFactoryOverrides } from './ServiceKanbanColumnBuilder.js'
import { KanbanColumnServiceError } from '../errors/KanbanColumnServiceError.js'

export const ServiceFactoryKanbanColumn = {
  create({ config, overrides = {} }: { config: KanbanColumnServiceFactoryConfig; overrides?: KanbanColumnServiceFactoryOverrides }): Effect.Effect<IKanbanColumnServicePort, KanbanColumnServiceError> {
    config.logger?.child({ module: 'ServiceFactoryKanbanColumn', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderKanbanColumn.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderKanbanColumn.create()
  },
}
