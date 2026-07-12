import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IProjectmanEventServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderProjectmanEvent, type ProjectmanEventServiceFactoryConfig, type ProjectmanEventServiceFactoryOverrides } from './ServiceProjectmanEventBuilder.js'
import { ProjectmanEventServiceError } from '../errors/ProjectmanEventServiceError.js'

export const ServiceFactoryProjectmanEvent = {
  create({ config, overrides = {} }: { config: ProjectmanEventServiceFactoryConfig; overrides?: ProjectmanEventServiceFactoryOverrides }): Effect.Effect<IProjectmanEventServicePort, ProjectmanEventServiceError> {
    config.logger?.child({ module: 'ServiceFactoryProjectmanEvent', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderProjectmanEvent.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderProjectmanEvent.create()
  },
}
