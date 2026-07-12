import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IAgentRunServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderAgentRun, type AgentRunServiceFactoryConfig, type AgentRunServiceFactoryOverrides } from './ServiceAgentRunBuilder.js'
import { AgentRunServiceError } from '../errors/AgentRunServiceError.js'

export const ServiceFactoryAgentRun = {
  create({ config, overrides = {} }: { config: AgentRunServiceFactoryConfig; overrides?: AgentRunServiceFactoryOverrides }): Effect.Effect<IAgentRunServicePort, AgentRunServiceError> {
    config.logger?.child({ module: 'ServiceFactoryAgentRun', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderAgentRun.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderAgentRun.create()
  },
}
