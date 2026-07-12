import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmTaskComment } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskComment } from '../../../../application/ports/repository-ports/index.js'
import { IdbTaskCommentDrizzle, taskCommentTable } from '../../../db/taskComment/drizzle/drizzle.schema.taskComment.js'
import { mapperTaskCommentDrizzle } from '../../../db/taskComment/drizzle/drizzle.mapper.taskComment.js'

export class TaskCommentDrizzleRepo extends DraBase<IbmTaskComment, IdbTaskCommentDrizzle, typeof taskCommentTable> implements IRepositoryPortTaskComment {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskCommentTable, { mapper: mapperTaskCommentDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmTaskComment>): Effect.Effect<IbmTaskComment | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbTaskCommentDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

