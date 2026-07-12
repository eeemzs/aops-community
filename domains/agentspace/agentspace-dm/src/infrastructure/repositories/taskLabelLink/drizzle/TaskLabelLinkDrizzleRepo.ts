import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskLabelLink } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskLabelLink } from '../../../../application/ports/repository-ports/IRepositoryPortTaskLabelLink.js'
import { IdbTaskLabelLinkDrizzle, taskLabelLinkTable } from '../../../db/taskLabelLink/drizzle/drizzle.schema.taskLabelLink.js'
import { mapperTaskLabelLinkDrizzle } from '../../../db/taskLabelLink/drizzle/drizzle.mapper.taskLabelLink.js'

export class TaskLabelLinkDrizzleRepo
  extends DraBase<IbmTaskLabelLink, IdbTaskLabelLinkDrizzle, typeof taskLabelLinkTable>
  implements IRepositoryPortTaskLabelLink {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskLabelLinkTable, { mapper: mapperTaskLabelLinkDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
