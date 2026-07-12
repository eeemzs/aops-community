import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentSession } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentSession } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentSessionDrizzleSqlite, agentSessionTableSqlite } from '../../../db/agentSession/drizzle/drizzle.schema.agentSession.sqlite.js'
import { mapperAgentSessionDrizzle } from '../../../db/agentSession/drizzle/drizzle.mapper.agentSession.js'

export class AgentSessionDrizzleSqliteRepo extends DraBaseSqlite<IbmAgentSession, IdbAgentSessionDrizzleSqlite, typeof agentSessionTableSqlite> implements IRepositoryPortAgentSession {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentSessionTableSqlite, { mapper: mapperAgentSessionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmAgentSession>): Effect.Effect<IbmAgentSession | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbAgentSessionDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
