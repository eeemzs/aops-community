import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmWorkflowStepRun } from '../../../../domain/models/index.js'
import { IRepositoryPortWorkflowStepRun } from '../../../../application/ports/repository-ports/index.js'
import { IdbWorkflowStepRunDrizzle, workflowStepRunTable } from '../../../db/workflowStepRun/drizzle/drizzle.schema.workflowStepRun.js'
import { mapperWorkflowStepRunDrizzle } from '../../../db/workflowStepRun/drizzle/drizzle.mapper.workflowStepRun.js'

export class WorkflowStepRunDrizzleRepo extends DraBase<IbmWorkflowStepRun, IdbWorkflowStepRunDrizzle, typeof workflowStepRunTable> implements IRepositoryPortWorkflowStepRun {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(workflowStepRunTable, { mapper: mapperWorkflowStepRunDrizzle, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
