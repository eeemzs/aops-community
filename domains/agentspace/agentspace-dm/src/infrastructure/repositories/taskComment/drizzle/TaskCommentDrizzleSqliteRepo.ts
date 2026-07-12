import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmTaskComment } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskComment } from '../../../../application/ports/repository-ports/index.js'
import { IdbTaskCommentDrizzleSqlite, taskCommentTableSqlite } from '../../../db/taskComment/drizzle/drizzle.schema.taskComment.sqlite.js'
import { mapperTaskCommentDrizzle } from '../../../db/taskComment/drizzle/drizzle.mapper.taskComment.js'

export class TaskCommentDrizzleSqliteRepo extends DraBaseSqlite<IbmTaskComment, IdbTaskCommentDrizzleSqlite, typeof taskCommentTableSqlite> implements IRepositoryPortTaskComment {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskCommentTableSqlite, { mapper: mapperTaskCommentDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbTaskCommentDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
