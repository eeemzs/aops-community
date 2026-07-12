import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmMission } from '../../../../domain/models/index.js'
import { IRepositoryPortMission } from '../../../../application/ports/repository-ports/index.js'
import { IdbMissionDrizzle, missionTable } from '../../../db/mission/drizzle/drizzle.schema.mission.js'
import { mapperMissionDrizzle } from '../../../db/mission/drizzle/drizzle.mapper.mission.js'

export class MissionDrizzleRepo extends DraBase<IbmMission, IdbMissionDrizzle, typeof missionTable> implements IRepositoryPortMission {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(missionTable, { mapper: mapperMissionDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }
}
