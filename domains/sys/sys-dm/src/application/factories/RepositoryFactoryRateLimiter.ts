// libs/domains/sys/src/application/factories/RateLimiterRepositoryFactory.ts
import { createRepositoryFactory } from '@aopslab/xf-dm';
import { IRepositoryPortRateLimiter } from '../ports/repository-ports/index.js';
import { RateLimiterPgRepo, RateLimiterMongooeseRepo, RateLimiterRedisRepo } from '../../infrastructure/repositories/index.js';

export const RateLimiterRepositoryFactory =
  createRepositoryFactory<IRepositoryPortRateLimiter>({
    moduleName: 'RateLimiterRepositoryFactory',
    mongoRepo: RateLimiterMongooeseRepo,
    drizzleRepo: RateLimiterPgRepo,
    redisRepo: RateLimiterRedisRepo
  });
