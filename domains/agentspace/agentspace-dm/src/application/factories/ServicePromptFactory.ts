import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPromptServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPrompt, type PromptServiceFactoryConfig, type PromptServiceFactoryOverrides } from './ServicePromptBuilder.js'
import { PromptServiceError } from '../errors/PromptServiceError.js'

export const ServiceFactoryPrompt = {
  create({ config, overrides = {} }: { config: PromptServiceFactoryConfig; overrides?: PromptServiceFactoryOverrides }): Effect.Effect<IPromptServicePort, PromptServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPrompt', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPrompt.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPrompt.create()
  },
}
