import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IEmbedServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderEmbed, type EmbedServiceFactoryConfig, type EmbedServiceFactoryOverrides } from './ServiceEmbedBuilder.js'
import { EmbedServiceError } from '../errors/EmbedServiceError.js'

export const ServiceFactoryEmbed = {
  create({ config, overrides = {} }: { config: EmbedServiceFactoryConfig; overrides?: EmbedServiceFactoryOverrides }): Effect.Effect<IEmbedServicePort, EmbedServiceError> {
    config.logger?.child({ module: 'ServiceFactoryEmbed', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderEmbed.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderEmbed.create()
  },
}
