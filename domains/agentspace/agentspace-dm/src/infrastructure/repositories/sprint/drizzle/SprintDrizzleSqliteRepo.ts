import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprint } from '../../../../domain/models/index.js'
import { IRepositoryPortSprint } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintDrizzleSqlite, sprintTableSqlite } from '../../../db/sprint/drizzle/drizzle.schema.sprint.sqlite.js'
import { mapperSprintDrizzle } from '../../../db/sprint/drizzle/drizzle.mapper.sprint.js'

export class SprintDrizzleSqliteRepo extends DraBaseSqlite<IbmSprint, IdbSprintDrizzleSqlite, typeof sprintTableSqlite> implements IRepositoryPortSprint {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintTableSqlite, { mapper: mapperSprintDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<IbmSprint | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSprintDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
