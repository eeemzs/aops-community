import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IArtifactServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderArtifact, type ArtifactServiceFactoryConfig, type ArtifactServiceFactoryOverrides } from './ServiceArtifactBuilder.js'
import { ArtifactServiceError } from '../errors/ArtifactServiceError.js'

export const ServiceFactoryArtifact = {
  create({ config, overrides = {} }: { config: ArtifactServiceFactoryConfig; overrides?: ArtifactServiceFactoryOverrides }): Effect.Effect<IArtifactServicePort, ArtifactServiceError> {
    config.logger?.child({ module: 'ServiceFactoryArtifact', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderArtifact.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderArtifact.create()
  },
}
