import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentRunEvent } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentRunEvent } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentRunEventDrizzle, agentRunEventTable } from '../../../db/agentRunEvent/drizzle/drizzle.schema.agentRunEvent.js'
import { mapperAgentRunEventDrizzle } from '../../../db/agentRunEvent/drizzle/drizzle.mapper.agentRunEvent.js'

export class AgentRunEventDrizzleRepo extends DraBase<IbmAgentRunEvent, IdbAgentRunEventDrizzle, typeof agentRunEventTable> implements IRepositoryPortAgentRunEvent {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentRunEventTable, { mapper: mapperAgentRunEventDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
