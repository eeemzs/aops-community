import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IDocumentVersionServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderDocumentVersion, type DocumentVersionServiceFactoryConfig, type DocumentVersionServiceFactoryOverrides } from './ServiceDocumentVersionBuilder.js'
import { DocumentVersionServiceError } from '../errors/DocumentVersionServiceError.js'

export const ServiceFactoryDocumentVersion = {
  create({ config, overrides = {} }: { config: DocumentVersionServiceFactoryConfig; overrides?: DocumentVersionServiceFactoryOverrides }): Effect.Effect<IDocumentVersionServicePort, DocumentVersionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryDocumentVersion', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderDocumentVersion.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderDocumentVersion.create()
  },
}

