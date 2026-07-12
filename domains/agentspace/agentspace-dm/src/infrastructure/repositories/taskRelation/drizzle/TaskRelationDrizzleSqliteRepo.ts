import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskRelation } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskRelation } from '../../../../application/ports/repository-ports/IRepositoryPortTaskRelation.js'
import { IdbTaskRelationDrizzleSqlite, taskRelationTableSqlite } from '../../../db/taskRelation/drizzle/drizzle.schema.taskRelation.sqlite.js'
import { mapperTaskRelationDrizzle } from '../../../db/taskRelation/drizzle/drizzle.mapper.taskRelation.js'

export class TaskRelationDrizzleSqliteRepo
  extends DraBaseSqlite<IbmTaskRelation, IdbTaskRelationDrizzleSqlite, typeof taskRelationTableSqlite>
  implements IRepositoryPortTaskRelation {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskRelationTableSqlite, { mapper: mapperTaskRelationDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
