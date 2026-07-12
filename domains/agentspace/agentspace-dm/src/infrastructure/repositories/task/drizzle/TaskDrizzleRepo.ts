import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmTask } from '../../../../domain/models/index.js'
import { IRepositoryPortTask } from '../../../../application/ports/repository-ports/index.js'
import { IdbTaskDrizzle, taskTable } from '../../../db/task/drizzle/drizzle.schema.task.js'
import { mapperTaskDrizzle } from '../../../db/task/drizzle/drizzle.mapper.task.js'

export class TaskDrizzleRepo extends DraBase<IbmTask, IdbTaskDrizzle, typeof taskTable> implements IRepositoryPortTask {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskTable, { mapper: mapperTaskDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmTask>): Effect.Effect<IbmTask | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbTaskDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

