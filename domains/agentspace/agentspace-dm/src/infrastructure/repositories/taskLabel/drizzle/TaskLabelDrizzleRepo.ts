import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'
import { IbmTaskLabel } from '../../../../domain/models/index.js'
import { IRepositoryPortTaskLabel } from '../../../../application/ports/repository-ports/IRepositoryPortTaskLabel.js'
import { IdbTaskLabelDrizzle, taskLabelTable } from '../../../db/taskLabel/drizzle/drizzle.schema.taskLabel.js'
import { mapperTaskLabelDrizzle } from '../../../db/taskLabel/drizzle/drizzle.mapper.taskLabel.js'

export class TaskLabelDrizzleRepo extends DraBase<IbmTaskLabel, IdbTaskLabelDrizzle, typeof taskLabelTable> implements IRepositoryPortTaskLabel {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(taskLabelTable, { mapper: mapperTaskLabelDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
