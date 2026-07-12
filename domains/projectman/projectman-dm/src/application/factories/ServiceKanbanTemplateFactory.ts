import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IKanbanTemplateServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderKanbanTemplate, type KanbanTemplateServiceFactoryConfig, type KanbanTemplateServiceFactoryOverrides } from './ServiceKanbanTemplateBuilder.js'
import { KanbanTemplateServiceError } from '../errors/KanbanTemplateServiceError.js'

export const ServiceFactoryKanbanTemplate = {
  create({ config, overrides = {} }: { config: KanbanTemplateServiceFactoryConfig; overrides?: KanbanTemplateServiceFactoryOverrides }): Effect.Effect<IKanbanTemplateServicePort, KanbanTemplateServiceError> {
    config.logger?.child({ module: 'ServiceFactoryKanbanTemplate', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderKanbanTemplate.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderKanbanTemplate.create()
  },
}
