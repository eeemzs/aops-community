import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IProjectMemberServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderProjectMember, type ProjectMemberServiceFactoryConfig, type ProjectMemberServiceFactoryOverrides } from './ServiceProjectMemberBuilder.js'
import { ProjectMemberServiceError } from '../errors/ProjectMemberServiceError.js'

export const ServiceFactoryProjectMember = {
  create({ config, overrides = {} }: { config: ProjectMemberServiceFactoryConfig; overrides?: ProjectMemberServiceFactoryOverrides }): Effect.Effect<IProjectMemberServicePort, ProjectMemberServiceError> {
    config.logger?.child({ module: 'ServiceFactoryProjectMember', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderProjectMember.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderProjectMember.create()
  },
}
