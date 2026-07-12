import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmMicroTaskItem } from '../../../../domain/models/index.js'
import { IRepositoryPortMicroTaskItem } from '../../../../application/ports/repository-ports/index.js'
import { IdbMicroTaskItemDrizzle, microTaskItemTable } from '../../../db/microTaskItem/drizzle/drizzle.schema.microTaskItem.js'
import { mapperMicroTaskItemDrizzle } from '../../../db/microTaskItem/drizzle/drizzle.mapper.microTaskItem.js'

export class MicroTaskItemDrizzleRepo extends DraBase<IbmMicroTaskItem, IdbMicroTaskItemDrizzle, typeof microTaskItemTable> implements IRepositoryPortMicroTaskItem {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(microTaskItemTable, { mapper: mapperMicroTaskItemDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig });
  }

  //==> custom-methods
  //<==//
}
