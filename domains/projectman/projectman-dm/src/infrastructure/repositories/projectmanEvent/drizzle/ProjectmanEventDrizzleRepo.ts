import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmProjectmanEvent } from '../../../../domain/models/index.js'
import { IRepositoryPortProjectmanEvent } from '../../../../application/ports/repository-ports/index.js'
import { IdbProjectmanEventDrizzle, projectmanEventTable } from '../../../db/projectmanEvent/drizzle/drizzle.schema.projectmanEvent.js'
import { mapperProjectmanEventDrizzle } from '../../../db/projectmanEvent/drizzle/drizzle.mapper.projectmanEvent.js'

export class ProjectmanEventDrizzleRepo extends DraBase<IbmProjectmanEvent, IdbProjectmanEventDrizzle, typeof projectmanEventTable> implements IRepositoryPortProjectmanEvent {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(projectmanEventTable, { mapper: mapperProjectmanEventDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  // Add domain-specific queries here.
  //<==//
}
