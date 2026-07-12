import { Effect } from 'effect'
import { getParent } from '@aopslab/xf-logger'
import type { IReviewRequestServicePort } from '../ports/inbound/index.js'
import { ServiceBuilderReviewRequest, type ReviewRequestServiceFactoryConfig, type ReviewRequestServiceFactoryOverrides } from './ServiceReviewRequestBuilder.js'
import { ReviewRequestServiceError } from '../errors/ReviewRequestServiceError.js'

export const ServiceFactoryReviewRequest = {
  create({ config, overrides = {} }: { config: ReviewRequestServiceFactoryConfig; overrides?: ReviewRequestServiceFactoryOverrides }): Effect.Effect<IReviewRequestServicePort, ReviewRequestServiceError> {
    config.logger?.child({ module: 'ServiceFactoryReviewRequest', parent: getParent(config.logger) }, { level: config.logLevel ?? 'info' })
    return Effect.gen(function* (_) {
      const builder = ServiceBuilderReviewRequest.create().withConfig(config).withOverrides(overrides)
      return yield* _(builder.build())
    })
  },
  builder() {
    return ServiceBuilderReviewRequest.create()
  },
}
