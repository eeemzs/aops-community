import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmAgentProfile } from '../../../../domain/models/index.js'
import { IRepositoryPortAgentProfile } from '../../../../application/ports/repository-ports/index.js'
import { IdbAgentProfileDrizzleSqlite, agentProfileTableSqlite } from '../../../db/agentProfile/drizzle/drizzle.schema.agentProfile.sqlite.js'
import { mapperAgentProfileDrizzle } from '../../../db/agentProfile/drizzle/drizzle.mapper.agentProfile.js'

export class AgentProfileDrizzleSqliteRepo extends DraBaseSqlite<IbmAgentProfile, IdbAgentProfileDrizzleSqlite, typeof agentProfileTableSqlite> implements IRepositoryPortAgentProfile {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(agentProfileTableSqlite, { mapper: mapperAgentProfileDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
