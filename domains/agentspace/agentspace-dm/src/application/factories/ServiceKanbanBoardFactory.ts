import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IKanbanBoardServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderKanbanBoard, type KanbanBoardServiceFactoryConfig, type KanbanBoardServiceFactoryOverrides, type KanbanBoardServiceFactoryDependencies } from './ServiceKanbanBoardBuilder.js'
import { KanbanBoardServiceError } from '../errors/KanbanBoardServiceError.js'

export const ServiceFactoryKanbanBoard = {
  create({
    config,
    overrides = {},
    dependencies = {},
  }: {
    config: KanbanBoardServiceFactoryConfig;
    overrides?: KanbanBoardServiceFactoryOverrides;
    dependencies?: Partial<KanbanBoardServiceFactoryDependencies>;
  }): Effect.Effect<IKanbanBoardServicePort, KanbanBoardServiceError> {
    config.logger?.child({ module: 'ServiceFactoryKanbanBoard', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderKanbanBoard.create()
        .withConfig(config)
        .withOverrides(overrides)
        .withServiceDependencies(dependencies)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderKanbanBoard.create()
  },
}
