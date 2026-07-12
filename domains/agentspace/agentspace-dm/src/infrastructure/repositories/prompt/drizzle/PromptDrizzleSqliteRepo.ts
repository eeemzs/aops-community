import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPrompt } from '../../../../domain/models/index.js'
import { IRepositoryPortPrompt } from '../../../../application/ports/repository-ports/index.js'
import { IdbPromptDrizzleSqlite, promptTableSqlite } from '../../../db/prompt/drizzle/drizzle.schema.prompt.sqlite.js'
import { mapperPromptDrizzle } from '../../../db/prompt/drizzle/drizzle.mapper.prompt.js'

export class PromptDrizzleSqliteRepo extends DraBaseSqlite<IbmPrompt, IdbPromptDrizzleSqlite, typeof promptTableSqlite> implements IRepositoryPortPrompt {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(promptTableSqlite, { mapper: mapperPromptDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPromptDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
