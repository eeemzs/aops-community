import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { ITagServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderTag, type TagServiceFactoryConfig, type TagServiceFactoryOverrides } from './ServiceTagBuilder.js'
import { TagServiceError } from '../errors/TagServiceError.js'

export const ServiceFactoryTag = {
  create({ config, overrides = {} }: { config: TagServiceFactoryConfig; overrides?: TagServiceFactoryOverrides }): Effect.Effect<ITagServicePort, TagServiceError> {
    config.logger?.child({ module: 'ServiceFactoryTag', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderTag.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderTag.create()
  },
}
