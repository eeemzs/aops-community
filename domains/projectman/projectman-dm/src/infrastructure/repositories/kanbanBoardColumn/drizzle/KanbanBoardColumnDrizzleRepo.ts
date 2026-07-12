import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanBoardColumn } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanBoardColumn } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanBoardColumnDrizzle, kanbanBoardColumnTable } from '../../../db/kanbanBoardColumn/drizzle/drizzle.schema.kanbanBoardColumn.js'
import { mapperKanbanBoardColumnDrizzle } from '../../../db/kanbanBoardColumn/drizzle/drizzle.mapper.kanbanBoardColumn.js'

export class KanbanBoardColumnDrizzleRepo extends DraBase<IbmKanbanBoardColumn, IdbKanbanBoardColumnDrizzle, typeof kanbanBoardColumnTable> implements IRepositoryPortKanbanBoardColumn {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanBoardColumnTable, { mapper: mapperKanbanBoardColumnDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmKanbanBoardColumn>): Effect.Effect<IbmKanbanBoardColumn | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbKanbanBoardColumnDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
