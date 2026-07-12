import { XfLogger } from '@aopslab/xf-logger'
import { DraBase } from '@aopslab/xf-db-drizzle'
import { RepositoryConfig } from '@aopslab/xf-db'

import { IbmWorkflowDefinition } from '../../../../domain/models/index.js'
import { IRepositoryPortWorkflowDefinition } from '../../../../application/ports/repository-ports/index.js'
import {
  IdbWorkflowDefinitionDrizzle,
  workflowDefinitionTable,
} from '../../../db/workflowDefinition/drizzle/drizzle.schema.workflowDefinition.js'
import { mapperWorkflowDefinitionDrizzle } from '../../../db/workflowDefinition/drizzle/drizzle.mapper.workflowDefinition.js'

export class WorkflowDefinitionDrizzleRepo
  extends DraBase<IbmWorkflowDefinition, IdbWorkflowDefinitionDrizzle, typeof workflowDefinitionTable>
  implements IRepositoryPortWorkflowDefinition
{
  constructor(deps: { repositoryConfig: RepositoryConfig; logger?: XfLogger }) {
    super(workflowDefinitionTable, {
      mapper: mapperWorkflowDefinitionDrizzle,
      logger: deps.logger,
      repositoryConfig: deps.repositoryConfig,
    })
  }
}
