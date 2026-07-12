import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'

import type { IAgentProfileServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderAgentProfile, type AgentProfileServiceFactoryConfig, type AgentProfileServiceFactoryOverrides } from './ServiceAgentProfileBuilder.js'
import { AgentProfileServiceError } from '../errors/AgentProfileServiceError.js'

export const ServiceFactoryAgentProfile = {
  create({ config, overrides = {} }: { config: AgentProfileServiceFactoryConfig; overrides?: AgentProfileServiceFactoryOverrides }): Effect.Effect<IAgentProfileServicePort, AgentProfileServiceError> {
    config.logger?.child({ module: 'ServiceFactoryAgentProfile', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderAgentProfile.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderAgentProfile.create()
  },
}
