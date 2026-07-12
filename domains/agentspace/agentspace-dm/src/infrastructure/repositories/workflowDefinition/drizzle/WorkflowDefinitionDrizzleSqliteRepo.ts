import { XfLogger } from '@aopslab/xf-logger'
import { DraBaseSqlite } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmWorkflowDefinition } from '../../../../domain/models/index.js'
import { IRepositoryPortWorkflowDefinition } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbWorkflowDefinitionDrizzleSqlite,
  workflowDefinitionTableSqlite,
} from '../../../db/workflowDefinition/drizzle/drizzle.schema.workflowDefinition.sqlite.js'
import { mapperWorkflowDefinitionDrizzle } from '../../../db/workflowDefinition/drizzle/drizzle.mapper.workflowDefinition.js'

export class WorkflowDefinitionDrizzleSqliteRepo
  extends DraBaseSqlite<IbmWorkflowDefinition, IdbWorkflowDefinitionDrizzleSqlite, typeof workflowDefinitionTableSqlite>
  implements IRepositoryPortWorkflowDefinition
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(workflowDefinitionTableSqlite, {
      mapper: mapperWorkflowDefinitionDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
