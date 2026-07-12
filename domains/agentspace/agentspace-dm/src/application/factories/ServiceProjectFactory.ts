import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IProjectServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderProject, type ProjectServiceFactoryConfig, type ProjectServiceFactoryOverrides } from './ServiceProjectBuilder.js'
import { ProjectServiceError } from '../errors/ProjectServiceError.js'

export const ServiceFactoryProject = {
  create({ config, overrides = {} }: { config: ProjectServiceFactoryConfig; overrides?: ProjectServiceFactoryOverrides }): Effect.Effect<IProjectServicePort, ProjectServiceError> {
    config.logger?.child({ module: 'ServiceFactoryProject', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderProject.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderProject.create()
  },
}
