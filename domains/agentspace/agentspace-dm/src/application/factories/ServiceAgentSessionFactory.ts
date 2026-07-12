import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IAgentSessionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderAgentSession, type AgentSessionServiceFactoryConfig, type AgentSessionServiceFactoryOverrides } from './ServiceAgentSessionBuilder.js'
import { AgentSessionServiceError } from '../errors/AgentSessionServiceError.js'

export const ServiceFactoryAgentSession = {
  create({ config, overrides = {} }: { config: AgentSessionServiceFactoryConfig; overrides?: AgentSessionServiceFactoryOverrides }): Effect.Effect<IAgentSessionServicePort, AgentSessionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryAgentSession', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderAgentSession.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderAgentSession.create()
  },
}
