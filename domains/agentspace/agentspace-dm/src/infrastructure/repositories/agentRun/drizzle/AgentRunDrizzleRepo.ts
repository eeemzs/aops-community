import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentRun } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentRun } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentRunDrizzle, agentRunTable } from '../../../db/agentRun/drizzle/drizzle.schema.agentRun.js'
import { mapperAgentRunDrizzle } from '../../../db/agentRun/drizzle/drizzle.mapper.agentRun.js'

export class AgentRunDrizzleRepo extends DraBase<IbmAgentRun, IdbAgentRunDrizzle, typeof agentRunTable> implements IRepositoryPortAgentRun {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentRunTable, { mapper: mapperAgentRunDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmAgentRun>): Effect.Effect<IbmAgentRun | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbAgentRunDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

