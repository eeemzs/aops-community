import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPromptVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortPromptVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbPromptVersionDrizzleSqlite, promptVersionTableSqlite } from '../../../db/promptVersion/drizzle/drizzle.schema.promptVersion.sqlite.js'
import { mapperPromptVersionDrizzle } from '../../../db/promptVersion/drizzle/drizzle.mapper.promptVersion.js'

export class PromptVersionDrizzleSqliteRepo extends DraBaseSqlite<IbmPromptVersion, IdbPromptVersionDrizzleSqlite, typeof promptVersionTableSqlite> implements IRepositoryPortPromptVersion {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(promptVersionTableSqlite, { mapper: mapperPromptVersionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPromptVersion>): Effect.Effect<IbmPromptVersion | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPromptVersionDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
