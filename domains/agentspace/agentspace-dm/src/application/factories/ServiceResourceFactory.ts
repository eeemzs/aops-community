import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IResourceServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderResource, type ResourceServiceFactoryConfig, type ResourceServiceFactoryOverrides } from './ServiceResourceBuilder.js'
import { ResourceServiceError } from '../errors/ResourceServiceError.js'

export const ServiceFactoryResource = {
  create({ config, overrides = {} }: { config: ResourceServiceFactoryConfig; overrides?: ResourceServiceFactoryOverrides }): Effect.Effect<IResourceServicePort, ResourceServiceError> {
    config.logger?.child({ module: 'ServiceFactoryResource', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderResource.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderResource.create()
  },
}
