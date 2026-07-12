import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPromptVersion } from '../../../../domain/models/index.js'
import { IRepositoryPortPromptVersion } from '../../../../application/ports/repository-ports/index.js'
import { IdbPromptVersionDrizzle, promptVersionTable } from '../../../db/promptVersion/drizzle/drizzle.schema.promptVersion.js'
import { mapperPromptVersionDrizzle } from '../../../db/promptVersion/drizzle/drizzle.mapper.promptVersion.js'

export class PromptVersionDrizzleRepo extends DraBase<IbmPromptVersion, IdbPromptVersionDrizzle, typeof promptVersionTable> implements IRepositoryPortPromptVersion {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(promptVersionTable, { mapper: mapperPromptVersionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPromptVersion>): Effect.Effect<IbmPromptVersion | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPromptVersionDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

