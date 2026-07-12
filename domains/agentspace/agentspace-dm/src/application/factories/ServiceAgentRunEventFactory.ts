import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IAgentRunEventServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderAgentRunEvent, type AgentRunEventServiceFactoryConfig, type AgentRunEventServiceFactoryOverrides } from './ServiceAgentRunEventBuilder.js'
import { AgentRunEventServiceError } from '../errors/AgentRunEventServiceError.js'

export const ServiceFactoryAgentRunEvent = {
  create({ config, overrides = {} }: { config: AgentRunEventServiceFactoryConfig; overrides?: AgentRunEventServiceFactoryOverrides }): Effect.Effect<IAgentRunEventServicePort, AgentRunEventServiceError> {
    config.logger?.child({ module: 'ServiceFactoryAgentRunEvent', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderAgentRunEvent.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderAgentRunEvent.create()
  },
}
