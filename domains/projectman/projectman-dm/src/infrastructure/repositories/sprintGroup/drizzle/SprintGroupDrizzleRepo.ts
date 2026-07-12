import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmSprintGroup } from '../../../../domain/models/index.js'
import { IRepositoryPortSprintGroup } from '../../../../application/ports/repository-ports/index.js'
import { IdbSprintGroupDrizzle, sprintGroupTable } from '../../../db/sprintGroup/drizzle/drizzle.schema.sprintGroup.js'
import { mapperSprintGroupDrizzle } from '../../../db/sprintGroup/drizzle/drizzle.mapper.sprintGroup.js'

export class SprintGroupDrizzleRepo extends DraBase<IbmSprintGroup, IdbSprintGroupDrizzle, typeof sprintGroupTable> implements IRepositoryPortSprintGroup {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(sprintGroupTable, { mapper: mapperSprintGroupDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  //<==//
}
