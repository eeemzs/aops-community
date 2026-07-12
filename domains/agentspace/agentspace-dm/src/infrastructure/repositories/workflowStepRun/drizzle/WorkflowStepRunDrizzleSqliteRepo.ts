import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmWorkflowStepRun } from '../../../../domain/models/index.js'
import { IRepositoryPortWorkflowStepRun } from '../../../../application/ports/repository-ports/index.js'
import { IdbWorkflowStepRunDrizzleSqlite, workflowStepRunTableSqlite } from '../../../db/workflowStepRun/drizzle/drizzle.schema.workflowStepRun.sqlite.js'
import { mapperWorkflowStepRunDrizzle } from '../../../db/workflowStepRun/drizzle/drizzle.mapper.workflowStepRun.js'

export class WorkflowStepRunDrizzleSqliteRepo extends DraBaseSqlite<IbmWorkflowStepRun, IdbWorkflowStepRunDrizzleSqlite, typeof workflowStepRunTableSqlite> implements IRepositoryPortWorkflowStepRun {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(workflowStepRunTableSqlite, { mapper: mapperWorkflowStepRunDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
