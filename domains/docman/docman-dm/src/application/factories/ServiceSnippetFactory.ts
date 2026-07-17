import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ISnippetServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderSnippet, type SnippetServiceFactoryConfig, type SnippetServiceFactoryOverrides } from './ServiceSnippetBuilder.js'
import { SnippetServiceError } from '../errors/SnippetServiceError.js'

export const ServiceFactorySnippet = {
  create({ config, overrides = {} }: { config: SnippetServiceFactoryConfig; overrides?: SnippetServiceFactoryOverrides }): Effect.Effect<ISnippetServicePort, SnippetServiceError> {
    config.logger?.child({ module: 'ServiceFactorySnippet', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderSnippet.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderSnippet.create()
  },
}
