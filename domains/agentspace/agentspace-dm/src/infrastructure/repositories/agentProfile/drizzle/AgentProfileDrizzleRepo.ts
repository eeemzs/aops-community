import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentProfile } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentProfile } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentProfileDrizzle, agentProfileTable } from '../../../db/agentProfile/drizzle/drizzle.schema.agentProfile.js'
import { mapperAgentProfileDrizzle } from '../../../db/agentProfile/drizzle/drizzle.mapper.agentProfile.js'

export class AgentProfileDrizzleRepo extends DraBase<IbmAgentProfile, IdbAgentProfileDrizzle, typeof agentProfileTable> implements IRepositoryPortAgentProfile {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentProfileTable, { mapper: mapperAgentProfileDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
