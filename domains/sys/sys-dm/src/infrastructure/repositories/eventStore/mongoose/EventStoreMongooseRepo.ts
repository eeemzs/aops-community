import { XfLogger } from '@aopslab/xf-logger';
import { MraBase } from '@aopslab/xf-db-mongoose';
import { Effect } from 'effect'

import { IbmEventStore } from '../../../../domain/models/index.js';
import { IRepositoryPortEventStore } from '../../../../application/ports/repository-ports/IRepositoryPortEventStore.js';
import { DbEventStore, IdbEventStore } from '../../../db/eventStore/mongoose/mongoose.schema.eventStore.js';
import { mapperEventStoreMongoose } from '../../../db/eventStore/mongoose/mongoose.mapper.eventStore.js';
import { RepositoryConfig } from '@aopslab/xf-db';

export class EventStoreMongooseRepo extends MraBase<IbmEventStore, IdbEventStore> implements IRepositoryPortEventStore {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(DbEventStore, {
      mapper: mapperEventStoreMongoose,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig
    });
  }

  /**
   * Event kaydet - En temel işlem
   */
  storeEvent(event: IbmEventStore): Effect.Effect<IbmEventStore, Error> {
    this.logger?.debug({ eventType: event.eventType, aggregateId: event.aggregateId }, 'storeEvent');
    return this.create(event).pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

  /**
   * Aggregate'a göre eventleri getir - Event Sourcing için gerekli
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], Error> {
    this.logger?.debug({ aggregateId }, 'getEventsByAggregate');
    return this.find({ aggregateId }).pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

  /**
   * Event type'a göre eventleri getir - Event type filtering
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], Error> {
    this.logger?.debug({ eventType, limit }, 'getEventsByType');
    const eff = limit ? this.find({ eventType }, { limit }) : this.find({ eventType });
    return eff.pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

  /**
   * Tüm eventleri getir - Basit listeleme
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], Error> {
    this.logger?.debug({ limit }, 'getAllEvents');
    const eff = limit ? this.find({}, { limit }) : this.find({});
    return eff.pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

}
