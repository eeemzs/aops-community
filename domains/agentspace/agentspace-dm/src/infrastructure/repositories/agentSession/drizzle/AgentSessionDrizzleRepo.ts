import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentSession } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentSession } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentSessionDrizzle, agentSessionTable } from '../../../db/agentSession/drizzle/drizzle.schema.agentSession.js'
import { mapperAgentSessionDrizzle } from '../../../db/agentSession/drizzle/drizzle.mapper.agentSession.js'

export class AgentSessionDrizzleRepo extends DraBase<IbmAgentSession, IdbAgentSessionDrizzle, typeof agentSessionTable> implements IRepositoryPortAgentSession {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentSessionTable, { mapper: mapperAgentSessionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmAgentSession>): Effect.Effect<IbmAgentSession | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbAgentSessionDrizzle> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}

