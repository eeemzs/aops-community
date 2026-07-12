import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISprintKanbanTaskLinkServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSprintKanbanTaskLink, type SprintKanbanTaskLinkServiceFactoryConfig, type SprintKanbanTaskLinkServiceFactoryOverrides } from './ServiceSprintKanbanTaskLinkBuilder.js'
import { SprintKanbanTaskLinkServiceError } from '../errors/SprintKanbanTaskLinkServiceError.js'

export const ServiceFactorySprintKanbanTaskLink = {
  create({ config, overrides = {} }: { config: SprintKanbanTaskLinkServiceFactoryConfig; overrides?: SprintKanbanTaskLinkServiceFactoryOverrides }): Effect.Effect<ISprintKanbanTaskLinkServicePort, SprintKanbanTaskLinkServiceError> {
    config.logger?.child({ module: 'ServiceFactorySprintKanbanTaskLink', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSprintKanbanTaskLink.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSprintKanbanTaskLink.create()
  },
}
