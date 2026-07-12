import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmMemoryItem } from '../../../../domain/models/index.js'
import { IRepositoryPortMemoryItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbMemoryItemDrizzleSqlite, memoryItemTableSqlite } from '../../../db/memoryItem/drizzle/drizzle.schema.memoryItem.sqlite.js'
import { mapperMemoryItemDrizzle } from '../../../db/memoryItem/drizzle/drizzle.mapper.memoryItem.js'

export class MemoryItemDrizzleSqliteRepo extends DraBaseSqlite<IbmMemoryItem, IdbMemoryItemDrizzleSqlite, typeof memoryItemTableSqlite> implements IRepositoryPortMemoryItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(memoryItemTableSqlite, { mapper: mapperMemoryItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmMemoryItem>): Effect.Effect<IbmMemoryItem | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbMemoryItemDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
