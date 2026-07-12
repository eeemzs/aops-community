import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmKanbanBoard } from '../../../../domain/models/index.js'
import { IRepositoryPortKanbanBoard } from '../../../../application/ports/repository-ports/index.js'
import { IdbKanbanBoardDrizzle, kanbanBoardTable } from '../../../db/kanbanBoard/drizzle/drizzle.schema.kanbanBoard.js'
import { mapperKanbanBoardDrizzle } from '../../../db/kanbanBoard/drizzle/drizzle.mapper.kanbanBoard.js'

export class KanbanBoardDrizzleRepo extends DraBase<IbmKanbanBoard, IdbKanbanBoardDrizzle, typeof kanbanBoardTable> implements IRepositoryPortKanbanBoard {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(kanbanBoardTable, { mapper: mapperKanbanBoardDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmKanbanBoard>): Effect.Effect<IbmKanbanBoard | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbKanbanBoardDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

