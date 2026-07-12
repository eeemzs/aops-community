import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmPrompt } from '../../../../domain/models/index.js'
import { IRepositoryPortPrompt } from '../../../../application/ports/repository-ports/index.js'
import { IdbPromptDrizzle, promptTable } from '../../../db/prompt/drizzle/drizzle.schema.prompt.js'
import { mapperPromptDrizzle } from '../../../db/prompt/drizzle/drizzle.mapper.prompt.js'

export class PromptDrizzleRepo extends DraBase<IbmPrompt, IdbPromptDrizzle, typeof promptTable> implements IRepositoryPortPrompt {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(promptTable, { mapper: mapperPromptDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmPrompt>): Effect.Effect<IbmPrompt | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbPromptDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

