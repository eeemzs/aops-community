import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmMemoryItem } from '../../../../domain/models/index.js'
import { IRepositoryPortMemoryItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbMemoryItemDrizzle, memoryItemTable } from '../../../db/memoryItem/drizzle/drizzle.schema.memoryItem.js'
import { mapperMemoryItemDrizzle } from '../../../db/memoryItem/drizzle/drizzle.mapper.memoryItem.js'

export class MemoryItemDrizzleRepo extends DraBase<IbmMemoryItem, IdbMemoryItemDrizzle, typeof memoryItemTable> implements IRepositoryPortMemoryItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(memoryItemTable, { mapper: mapperMemoryItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmMemoryItem>): Effect.Effect<IbmMemoryItem | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbMemoryItemDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

