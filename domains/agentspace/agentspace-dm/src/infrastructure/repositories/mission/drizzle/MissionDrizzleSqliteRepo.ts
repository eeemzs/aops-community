import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmMission } from '../../../../domain/models/index.js'
import { IRepositoryPortMission } from '../../../../application/ports/repository-ports/index.js'
import { IdbMissionDrizzleSqlite, missionTableSqlite } from '../../../db/mission/drizzle/drizzle.schema.mission.sqlite.js'
import { mapperMissionDrizzle } from '../../../db/mission/drizzle/drizzle.mapper.mission.js'

export class MissionDrizzleSqliteRepo extends DraBaseSqlite<IbmMission, IdbMissionDrizzleSqlite, typeof missionTableSqlite> implements IRepositoryPortMission {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(missionTableSqlite, { mapper: mapperMissionDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }
}
