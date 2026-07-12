import { IRepositoryPortWorkflowDefinition } from '../ports/repository-ports/index.js'
import { WorkflowDefinitionDrizzleRepo, WorkflowDefinitionDrizzleSqliteRepo } from '../../infrastructure/repositories/index.js'
import { createAgentspaceDrizzleRepositoryFactory } from './drizzleDialect.js'

export const RepositoryFactoryWorkflowDefinition =
  createAgentspaceDrizzleRepositoryFactory<IRepositoryPortWorkflowDefinition>({
    moduleName: 'RepositoryFactoryWorkflowDefinition',
    pgRepo: WorkflowDefinitionDrizzleRepo,
    sqliteRepo: WorkflowDefinitionDrizzleSqliteRepo,
  })
