import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IDocumentSectionLinkServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderDocumentSectionLink, type DocumentSectionLinkServiceFactoryConfig, type DocumentSectionLinkServiceFactoryOverrides } from './ServiceDocumentSectionLinkBuilder.js'
import { DocumentSectionLinkServiceError } from '../errors/DocumentSectionLinkServiceError.js'

export const ServiceFactoryDocumentSectionLink = {
  create({ config, overrides = {} }: { config: DocumentSectionLinkServiceFactoryConfig; overrides?: DocumentSectionLinkServiceFactoryOverrides }): Effect.Effect<IDocumentSectionLinkServicePort, DocumentSectionLinkServiceError> {
    config.logger?.child({ module: 'ServiceFactoryDocumentSectionLink', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderDocumentSectionLink.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderDocumentSectionLink.create()
  },
}

