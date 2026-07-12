import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskLabel } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskLabel } from '../../../../application/ports/repository-ports/IRepositoryPortTaskLabel.js'
import { IdbTaskLabelDrizzleSqlite, taskLabelTableSqlite } from '../../../db/taskLabel/drizzle/drizzle.schema.taskLabel.sqlite.js'
import { mapperTaskLabelDrizzle } from '../../../db/taskLabel/drizzle/drizzle.mapper.taskLabel.js'

export class TaskLabelDrizzleSqliteRepo
  extends DraBaseSqlite<IbmTaskLabel, IdbTaskLabelDrizzleSqlite, typeof taskLabelTableSqlite>
  implements IRepositoryPortTaskLabel {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskLabelTableSqlite, { mapper: mapperTaskLabelDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
