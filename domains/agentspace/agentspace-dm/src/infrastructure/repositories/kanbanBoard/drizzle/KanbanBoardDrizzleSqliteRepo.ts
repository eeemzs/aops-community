import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanBoard } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanBoard } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanBoardDrizzleSqlite, kanbanBoardTableSqlite } from '../../../db/kanbanBoard/drizzle/drizzle.schema.kanbanBoard.sqlite.js'
import { mapperKanbanBoardDrizzle } from '../../../db/kanbanBoard/drizzle/drizzle.mapper.kanbanBoard.js'

export class KanbanBoardDrizzleSqliteRepo extends DraBaseSqlite<IbmKanbanBoard, IdbKanbanBoardDrizzleSqlite, typeof kanbanBoardTableSqlite> implements IRepositoryPortKanbanBoard {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanBoardTableSqlite, { mapper: mapperKanbanBoardDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbKanbanBoardDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
