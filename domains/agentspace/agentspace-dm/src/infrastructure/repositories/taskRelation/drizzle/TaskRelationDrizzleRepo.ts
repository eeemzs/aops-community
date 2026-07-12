import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskRelation } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskRelation } from '../../../../application/ports/repository-ports/IRepositoryPortTaskRelation.js'
import { IdbTaskRelationDrizzle, taskRelationTable } from '../../../db/taskRelation/drizzle/drizzle.schema.taskRelation.js'
import { mapperTaskRelationDrizzle } from '../../../db/taskRelation/drizzle/drizzle.mapper.taskRelation.js'

export class TaskRelationDrizzleRepo
  extends DraBase<IbmTaskRelation, IdbTaskRelationDrizzle, typeof taskRelationTable>
  implements IRepositoryPortTaskRelation {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskRelationTable, { mapper: mapperTaskRelationDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
