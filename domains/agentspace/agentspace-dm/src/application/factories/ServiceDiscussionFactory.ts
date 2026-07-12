import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IDiscussionServicePort } from '../ports/inbound/index.js'
import {
  ServiceBuilderDiscussion,
  type DiscussionServiceFactoryConfig,
  type DiscussionServiceFactoryOverrides,
} from './ServiceDiscussionBuilder.js'
import { DiscussionServiceError } from '../errors/DiscussionServiceError.js'

export const ServiceFactoryDiscussion = {
  create({ config, overrides = {} }: { config: DiscussionServiceFactoryConfig; overrides?: DiscussionServiceFactoryOverrides }): Effect.Effect<IDiscussionServicePort, DiscussionServiceError> {
    config.logger?.child({ module: 'ServiceFactoryDiscussion', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderDiscussion.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderDiscussion.create()
  },
}
