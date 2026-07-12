import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IProjectPathServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderProjectPath, type ProjectPathServiceFactoryConfig, type ProjectPathServiceFactoryOverrides } from './ServiceProjectPathBuilder.js'
import { ProjectPathServiceError } from '../errors/ProjectPathServiceError.js'

export const ServiceFactoryProjectPath = {
  create({ config, overrides = {} }: { config: ProjectPathServiceFactoryConfig; overrides?: ProjectPathServiceFactoryOverrides }): Effect.Effect<IProjectPathServicePort, ProjectPathServiceError> {
    config.logger?.child({ module: 'ServiceFactoryProjectPath', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderProjectPath.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderProjectPath.create()
  },
}
