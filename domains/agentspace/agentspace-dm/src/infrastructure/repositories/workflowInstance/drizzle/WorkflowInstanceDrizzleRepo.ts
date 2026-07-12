import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmWorkflowInstance } from '../../../../domain/models/index.js'
import { IRepositoryPortWorkflowInstance } from '../../../../application/ports/repository-ports/index.js'
import { IdbWorkflowInstanceDrizzle, workflowInstanceTable } from '../../../db/workflowInstance/drizzle/drizzle.schema.workflowInstance.js'
import { mapperWorkflowInstanceDrizzle } from '../../../db/workflowInstance/drizzle/drizzle.mapper.workflowInstance.js'

export class WorkflowInstanceDrizzleRepo extends DraBase<IbmWorkflowInstance, IdbWorkflowInstanceDrizzle, typeof workflowInstanceTable> implements IRepositoryPortWorkflowInstance {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(workflowInstanceTable, { mapper: mapperWorkflowInstanceDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
