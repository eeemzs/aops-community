import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IDocumentGroupServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderDocumentGroup, type DocumentGroupServiceFactoryConfig, type DocumentGroupServiceFactoryOverrides } from './ServiceDocumentGroupBuilder.js'
import { DocumentGroupServiceError } from '../errors/DocumentGroupServiceError.js'

export const ServiceFactoryDocumentGroup = {
  create({ config, overrides = {} }: { config: DocumentGroupServiceFactoryConfig; overrides?: DocumentGroupServiceFactoryOverrides }): Effect.Effect<IDocumentGroupServicePort, DocumentGroupServiceError> {
    config.logger?.child({ module: 'ServiceFactoryDocumentGroup', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderDocumentGroup.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderDocumentGroup.create()
  },
}
