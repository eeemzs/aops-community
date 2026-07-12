import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IFeedbackItemServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderFeedbackItem, type FeedbackItemServiceFactoryConfig, type FeedbackItemServiceFactoryOverrides } from './ServiceFeedbackItemBuilder.js'
import { FeedbackItemServiceError } from '../errors/FeedbackItemServiceError.js'

export const ServiceFactoryFeedbackItem = {
  create({ config, overrides = {} }: { config: FeedbackItemServiceFactoryConfig; overrides?: FeedbackItemServiceFactoryOverrides }): Effect.Effect<IFeedbackItemServicePort, FeedbackItemServiceError> {
    config.logger?.child({ module: 'ServiceFactoryFeedbackItem', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderFeedbackItem.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderFeedbackItem.create()
  },
}
