import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IArtifactLinkServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderArtifactLink, type ArtifactLinkServiceFactoryConfig, type ArtifactLinkServiceFactoryOverrides } from './ServiceArtifactLinkBuilder.js'
import { ArtifactLinkServiceError } from '../errors/ArtifactLinkServiceError.js'

export const ServiceFactoryArtifactLink = {
  create({ config, overrides = {} }: { config: ArtifactLinkServiceFactoryConfig; overrides?: ArtifactLinkServiceFactoryOverrides }): Effect.Effect<IArtifactLinkServicePort, ArtifactLinkServiceError> {
    config.logger?.child({ module: 'ServiceFactoryArtifactLink', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderArtifactLink.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderArtifactLink.create()
  },
}
