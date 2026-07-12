import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IDocumentServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderDocument, type DocumentServiceFactoryConfig, type DocumentServiceFactoryOverrides } from './ServiceDocumentBuilder.js'
import { DocumentServiceError } from '../errors/DocumentServiceError.js'

export const ServiceFactoryDocument = {
  create({ config, overrides = {} }: { config: DocumentServiceFactoryConfig; overrides?: DocumentServiceFactoryOverrides }): Effect.Effect<IDocumentServicePort, DocumentServiceError> {
    config.logger?.child({ module: 'ServiceFactoryDocument', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderDocument.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderDocument.create()
  },
}

