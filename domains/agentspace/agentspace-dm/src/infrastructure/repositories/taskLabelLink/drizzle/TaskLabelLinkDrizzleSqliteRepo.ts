import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskLabelLink } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskLabelLink } from '../../../../application/ports/repository-ports/IRepositoryPortTaskLabelLink.js'
import { IdbTaskLabelLinkDrizzleSqlite, taskLabelLinkTableSqlite } from '../../../db/taskLabelLink/drizzle/drizzle.schema.taskLabelLink.sqlite.js'
import { mapperTaskLabelLinkDrizzle } from '../../../db/taskLabelLink/drizzle/drizzle.mapper.taskLabelLink.js'

export class TaskLabelLinkDrizzleSqliteRepo
  extends DraBaseSqlite<IbmTaskLabelLink, IdbTaskLabelLinkDrizzleSqlite, typeof taskLabelLinkTableSqlite>
  implements IRepositoryPortTaskLabelLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskLabelLinkTableSqlite, { mapper: mapperTaskLabelLinkDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
