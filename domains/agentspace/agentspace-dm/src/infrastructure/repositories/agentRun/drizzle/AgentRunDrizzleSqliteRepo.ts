import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentRun } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentRun } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentRunDrizzleSqlite, agentRunTableSqlite } from '../../../db/agentRun/drizzle/drizzle.schema.agentRun.sqlite.js'
import { mapperAgentRunDrizzle } from '../../../db/agentRun/drizzle/drizzle.mapper.agentRun.js'

export class AgentRunDrizzleSqliteRepo extends DraBaseSqlite<IbmAgentRun, IdbAgentRunDrizzleSqlite, typeof agentRunTableSqlite> implements IRepositoryPortAgentRun {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentRunTableSqlite, { mapper: mapperAgentRunDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here (example below).
  // findByDummyString(dummyString: string, options?: DbQueryOptions<IbmAgentRun>): Effect.Effect<IbmAgentRun | null, RepositoryError> {
  //   return this.findSingle({ matchEq: { dummyString }, options: options as DbQueryOptions<IdbAgentRunDrizzleSqlite> }).pipe(
  //     Effect.mapError((e): RepositoryError => e)
  //   );
  // }
  //<==//
}
