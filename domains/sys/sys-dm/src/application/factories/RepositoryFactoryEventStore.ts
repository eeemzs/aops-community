import { createRepositoryFactory } from '@aopslab/xf-dm';
import { IRepositoryPortEventStore } from '../ports/repository-ports/IRepositoryPortEventStore.js';
import { EventStorePgRepo, EventStoreMongooseRepo, EventStoreRedisRepo } from '../../infrastructure/repositories/index.js';

export const EventStoreRepositoryFactory =
  createRepositoryFactory<IRepositoryPortEventStore>({
    moduleName: 'EventStoreRepositoryFactory',
    mongoRepo: EventStoreMongooseRepo,
    drizzleRepo: EventStorePgRepo,
    redisRepo: EventStoreRedisRepo as any
  });
