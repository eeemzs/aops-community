import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPageEmbedLinkServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPageEmbedLink, type PageEmbedLinkServiceFactoryConfig, type PageEmbedLinkServiceFactoryOverrides } from './ServicePageEmbedLinkBuilder.js'
import { PageEmbedLinkServiceError } from '../errors/PageEmbedLinkServiceError.js'

export const ServiceFactoryPageEmbedLink = {
  create({ config, overrides = {} }: { config: PageEmbedLinkServiceFactoryConfig; overrides?: PageEmbedLinkServiceFactoryOverrides }): Effect.Effect<IPageEmbedLinkServicePort, PageEmbedLinkServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPageEmbedLink', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPageEmbedLink.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPageEmbedLink.create()
  },
}
