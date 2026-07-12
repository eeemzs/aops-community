import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanColumn } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanColumn } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanColumnDrizzle, kanbanColumnTable } from '../../../db/kanbanColumn/drizzle/drizzle.schema.kanbanColumn.js'
import { mapperKanbanColumnDrizzle } from '../../../db/kanbanColumn/drizzle/drizzle.mapper.kanbanColumn.js'

export class KanbanColumnDrizzleRepo extends DraBase<IbmKanbanColumn, IdbKanbanColumnDrizzle, typeof kanbanColumnTable> implements IRepositoryPortKanbanColumn {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanColumnTable, { mapper: mapperKanbanColumnDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmKanbanColumn>): Effect.Effect<IbmKanbanColumn | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbKanbanColumnDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

