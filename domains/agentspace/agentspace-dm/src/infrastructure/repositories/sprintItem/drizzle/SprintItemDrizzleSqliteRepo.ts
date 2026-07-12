import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprintItem } from '../../../../domain/models/index.js'
import { IRepositoryPortSprintItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintItemDrizzleSqlite, sprintItemTableSqlite } from '../../../db/sprintItem/drizzle/drizzle.schema.sprintItem.sqlite.js'
import { mapperSprintItemDrizzle } from '../../../db/sprintItem/drizzle/drizzle.mapper.sprintItem.js'

export class SprintItemDrizzleSqliteRepo extends DraBaseSqlite<IbmSprintItem, IdbSprintItemDrizzleSqlite, typeof sprintItemTableSqlite> implements IRepositoryPortSprintItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintItemTableSqlite, { mapper: mapperSprintItemDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSprintItem>): Effect.Effect<IbmSprintItem | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSprintItemDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
