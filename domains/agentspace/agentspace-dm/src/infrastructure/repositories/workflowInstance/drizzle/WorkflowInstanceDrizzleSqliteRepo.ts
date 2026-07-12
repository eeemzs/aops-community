import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmWorkflowInstance } from '../../../../domain/models/index.js'
import { IRepositoryPortWorkflowInstance } from '../../../../application/ports/repository-ports/index.js'
import { IdbWorkflowInstanceDrizzleSqlite, workflowInstanceTableSqlite } from '../../../db/workflowInstance/drizzle/drizzle.schema.workflowInstance.sqlite.js'
import { mapperWorkflowInstanceDrizzle } from '../../../db/workflowInstance/drizzle/drizzle.mapper.workflowInstance.js'

export class WorkflowInstanceDrizzleSqliteRepo extends DraBaseSqlite<IbmWorkflowInstance, IdbWorkflowInstanceDrizzleSqlite, typeof workflowInstanceTableSqlite> implements IRepositoryPortWorkflowInstance {
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(workflowInstanceTableSqlite, { mapper: mapperWorkflowInstanceDrizzle as any, logger: deps.logger, repositoryConfig: deps.repositoryConfig })
  }
}
