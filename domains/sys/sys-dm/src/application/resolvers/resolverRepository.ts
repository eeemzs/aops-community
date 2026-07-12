import { createResolverEffect, RepositoryCreateParams, RepositoryFactoryError } from '@aopslab/xf-dm'
import { RateLimiterRepositoryFactory } from '../factories/RepositoryFactoryRateLimiter.js'
import { EventStoreRepositoryFactory } from '../factories/RepositoryFactoryEventStore.js'

export type RepositoryName = 'rateLimiter' | 'eventStore'

const _resolveRepository = createResolverEffect<
  RepositoryName,
  RepositoryCreateParams,
  unknown,
  RepositoryFactoryError
>({
  factories: {
    rateLimiter: RateLimiterRepositoryFactory,
    eventStore: EventStoreRepositoryFactory,
  },
  errorPrefix: 'Repository',
})

export function resolveRepository<TPort>(name: RepositoryName, params: RepositoryCreateParams) {
  return _resolveRepository(name, params)
}
