import { XfLogger } from '@aopslab/xf-logger';
import { DraBase } from '@aopslab/xf-db-drizzle';
// DraBase otomatik tenant filtering kullanıyor, manual SQL imports gerekmez
import { Effect } from 'effect'

import { IbmEventStore } from '../../../../domain/models/index.js';
import { IRepositoryPortEventStore } from '../../../../application/ports/repository-ports/IRepositoryPortEventStore.js';
import { IdbEventStoreDrizzlePg, pgEventStore } from '../../../db/eventStore/pg/index.js';
import { mapperEventStorePg } from '../../../db/eventStore/pg/pg.mapper.eventStore.js';
import { RepositoryConfig } from '@aopslab/xf-db';

export class EventStorePgRepo
  extends DraBase<IbmEventStore, IdbEventStoreDrizzlePg, typeof pgEventStore>
  implements IRepositoryPortEventStore
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    // const db = getDrizzleDbSingleton()
    // if (!db) {
    //   throw new Error('Database connection is required for EventStorePgRepo')
    // }
    super(pgEventStore, {
      mapper: mapperEventStorePg,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig
    }); //, db)
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
   * Version'a göre sıralı olarak döner (ascending order)
   */
  getEventsByAggregate(aggregateId: string): Effect.Effect<IbmEventStore[], Error> {
    this.logger?.debug({ aggregateId }, 'getEventsByAggregate');
    return this.find({
      matchEq: { aggregateId },
      options: {
        sort: [
          { field: 'version', type: 'asc' },
          { field: 'occurredAt', type: 'asc' }
        ]
      }
    }).pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

  /**
   * Event type'a göre eventleri getir - Event type filtering
   * OccurredAt'e göre ters sıralı (en yeni önce)
   */
  getEventsByType(eventType: string, limit?: number): Effect.Effect<IbmEventStore[], Error> {
    this.logger?.debug({ eventType, limit }, 'getEventsByType');
    return this.find({
      matchEq: { eventType },
      options: {
        sort: [{ field: 'occurredAt', type: 'desc' }],
        limit
      }
    }).pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

  /**
   * Tüm eventleri getir - Basit listeleme
   * OccurredAt'e göre ters sıralı (en yeni önce)
   */
  getAllEvents(limit?: number): Effect.Effect<IbmEventStore[], Error> {
    this.logger?.debug({ limit }, 'getAllEvents');
    return this.find({
      matchEq: {},
      options: {
        sort: [{ field: 'occurredAt', type: 'desc' }],
        limit
      }
    }).pipe(
      Effect.mapError((e) => (e instanceof Error ? e : new Error(String(e))))
    );
  }

}
