import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprintItem } from '../../../../domain/models/index.js'
import { IRepositoryPortSprintItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintItemDrizzle, sprintItemTable } from '../../../db/sprintItem/drizzle/drizzle.schema.sprintItem.js'
import { mapperSprintItemDrizzle } from '../../../db/sprintItem/drizzle/drizzle.mapper.sprintItem.js'

export class SprintItemDrizzleRepo extends DraBase<IbmSprintItem, IdbSprintItemDrizzle, typeof sprintItemTable> implements IRepositoryPortSprintItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintItemTable, { mapper: mapperSprintItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmSprintItem>): Effect.Effect<IbmSprintItem | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbSprintItemDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

