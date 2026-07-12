import { createRepositoryFactory } from '@aopslab/xf-dm'
import type { IRepositoryPortCounter } from '../ports/repository-ports/index.js'
import { CounterMongooseRepo, CounterPgRepo } from '../../infrastructure/repositories/index.js'

export const CounterRepositoryFactory = createRepositoryFactory<IRepositoryPortCounter>({
  moduleName: 'CounterRepositoryFactory',
  mongoRepo: CounterMongooseRepo,
  drizzleRepo: CounterPgRepo,
  redisRepo: undefined as never,
})
