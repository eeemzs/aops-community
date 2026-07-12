import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentRunEvent } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentRunEvent } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentRunEventDrizzleSqlite, agentRunEventTableSqlite } from '../../../db/agentRunEvent/drizzle/drizzle.schema.agentRunEvent.sqlite.js'
import { mapperAgentRunEventDrizzle } from '../../../db/agentRunEvent/drizzle/drizzle.mapper.agentRunEvent.js'

export class AgentRunEventDrizzleSqliteRepo extends DraBaseSqlite<IbmAgentRunEvent, IdbAgentRunEventDrizzleSqlite, typeof agentRunEventTableSqlite> implements IRepositoryPortAgentRunEvent {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentRunEventTableSqlite, { mapper: mapperAgentRunEventDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
