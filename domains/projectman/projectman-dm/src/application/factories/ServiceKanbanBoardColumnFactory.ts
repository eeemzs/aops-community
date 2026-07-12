import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IKanbanBoardColumnServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderKanbanBoardColumn, type KanbanBoardColumnServiceFactoryConfig, type KanbanBoardColumnServiceFactoryOverrides } from './ServiceKanbanBoardColumnBuilder.js'
import { KanbanBoardColumnServiceError } from '../errors/KanbanBoardColumnServiceError.js'

export const ServiceFactoryKanbanBoardColumn = {
  create({ config, overrides = {} }: { config: KanbanBoardColumnServiceFactoryConfig; overrides?: KanbanBoardColumnServiceFactoryOverrides }): Effect.Effect<IKanbanBoardColumnServicePort, KanbanBoardColumnServiceError> {
    config.logger?.child({ module: 'ServiceFactoryKanbanBoardColumn', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderKanbanBoardColumn.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderKanbanBoardColumn.create()
  },
}
