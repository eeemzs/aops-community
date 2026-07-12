import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprint } from '../../../../domain/models/index.js'
import { IRepositoryPortSprint } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintDrizzle, sprintTable } from '../../../db/sprint/drizzle/drizzle.schema.sprint.js'
import { mapperSprintDrizzle } from '../../../db/sprint/drizzle/drizzle.mapper.sprint.js'

export class SprintDrizzleRepo extends DraBase<IbmSprint, IdbSprintDrizzle, typeof sprintTable> implements IRepositoryPortSprint {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintTable, { mapper: mapperSprintDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSprint>): Effect.Effect<IbmSprint | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSprintDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

