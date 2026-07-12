import { Effect } from 'effect'
import { RepositoryConfig } from '@aopslab/xf-db'
import { RedisConfig } from '@aopslab/xf-db-redis'
import { XfConfigurationError } from '@aopslab/xf-core'
import type { XfLogger } from '@aopslab/xf-logger'

import type { ICounterServicePort } from '../ports/inbound/ICounterServicePort.js'
import type { IRepositoryPortCounter } from '../ports/repository-ports/index.js'
import { CounterService } from '../services/counter/service.counter.js'
import { CounterRepositoryFactory } from './RepositoryFactoryCounter.js'

export interface CounterServiceFactoryConfig {
  counterRepositoryConfig?: RepositoryConfig
  redisConfig?: RedisConfig
  logger?: XfLogger
  logLevel?: string
}

export interface CounterServiceFactoryOverrides {
  repository?: IRepositoryPortCounter
}

export class ServiceBuilderCounter {
  private config?: CounterServiceFactoryConfig
  private overrides: CounterServiceFactoryOverrides = {}

  static create(): ServiceBuilderCounter {
    return new ServiceBuilderCounter()
  }

  withConfig(config: CounterServiceFactoryConfig): this {
    this.config = config
    return this
  }

  withRepository(repository: IRepositoryPortCounter): this {
    this.overrides.repository = repository
    return this
  }

  build(): Effect.Effect<ICounterServicePort, Error> {
    const self = this
    return Effect.gen(function* (_) {
      if (!self.config && !self.overrides.repository) {
        return yield* _(
          Effect.fail(
            new XfConfigurationError({
              message: 'CounterServiceBuilder requires counterRepositoryConfig or repository override.',
              stage: 'ServiceBuilderCounter::build',
            }),
          ),
        )
      }

      const config = self.config ?? {}
      const repository =
        self.overrides.repository ??
        (yield* _(
          CounterRepositoryFactory.create({
            repositoryConfig: config.counterRepositoryConfig as RepositoryConfig,
            redisConfig: config.redisConfig,
            logger: config.logger,
          }),
        ))

      return new CounterService({ counterRepository: repository, logger: config.logger }) as ICounterServicePort
    })
  }
}
