import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IPageSnippetLinkServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderPageSnippetLink, type PageSnippetLinkServiceFactoryConfig, type PageSnippetLinkServiceFactoryOverrides } from './ServicePageSnippetLinkBuilder.js'
import { PageSnippetLinkServiceError } from '../errors/PageSnippetLinkServiceError.js'

export const ServiceFactoryPageSnippetLink = {
  create({ config, overrides = {} }: { config: PageSnippetLinkServiceFactoryConfig; overrides?: PageSnippetLinkServiceFactoryOverrides }): Effect.Effect<IPageSnippetLinkServicePort, PageSnippetLinkServiceError> {
    config.logger?.child({ module: 'ServiceFactoryPageSnippetLink', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderPageSnippetLink.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderPageSnippetLink.create()
  },
}

